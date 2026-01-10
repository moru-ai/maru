import { Storage, Bucket } from "@google-cloud/storage";
import type { Sandbox } from "@moru-ai/core";
import type { FileNode } from "@repo/types";
import { nanoid } from "nanoid";
import type {
  SandboxStorage,
  SaveOptions,
  SaveResult,
  RestoreResult,
} from "./sandbox-storage";
import { DEFAULT_EXCLUDE_PATTERNS } from "./constants";

interface GCSConfig {
  bucketName: string;
  keyFile?: string;
  credentialsBase64?: string;
}

interface Manifest {
  archiveId: string;
  taskId: string;
  userId: string;
  paths: string[];
  sizeBytes: number;
  fileCount: number;
  createdAt: string;
  tree: FileNode[];
}

/**
 * GCS implementation of SandboxStorage
 */
export class GCSSandboxStorage implements SandboxStorage {
  readonly provider = "gcs";
  private storage: Storage;
  private bucket: Bucket;

  constructor(config: GCSConfig) {
    const storageOptions: ConstructorParameters<typeof Storage>[0] = {};

    if (config.credentialsBase64) {
      // Parse base64-encoded credentials
      const credentials = JSON.parse(
        Buffer.from(config.credentialsBase64, "base64").toString("utf-8")
      );
      storageOptions.credentials = credentials;
      storageOptions.projectId = credentials.project_id;
    } else if (config.keyFile) {
      storageOptions.keyFilename = config.keyFile;
    }
    // Otherwise uses Application Default Credentials

    this.storage = new Storage(storageOptions);
    this.bucket = this.storage.bucket(config.bucketName);
  }

  async save(
    taskId: string,
    userId: string,
    sandbox: Sandbox,
    options?: SaveOptions
  ): Promise<SaveResult> {
    const archiveId = `ws_${taskId.slice(0, 8)}_${Date.now()}_${nanoid(8)}`;
    const paths = options?.paths ?? ["/workspace"];

    try {
      // Build exclude args for tar
      const excludes = [
        ...DEFAULT_EXCLUDE_PATTERNS,
        ...(options?.excludes ?? []),
      ];
      const excludeArgs = excludes.map((p) => `--exclude='${p}'`).join(" ");

      // Create tar archive in sandbox
      const tarPath = `/tmp/${archiveId}.tar.gz`;

      // Build tar command for multiple paths
      const pathsArg = paths.join(" ");
      const tarCmd = `tar ${excludeArgs} -czf ${tarPath} -C / ${pathsArg.replace(/^\//g, "").replace(/ \//g, " ")}`;

      const tarResult = await sandbox.commands.run(tarCmd, { timeoutMs: 60000 });
      if (tarResult.exitCode !== 0) {
        return {
          success: false,
          archiveId,
          sizeBytes: 0,
          paths,
          error: tarResult.stderr || "Failed to create tar archive",
        };
      }

      // Count files in archive
      const countResult = await sandbox.commands.run(`tar -tzf ${tarPath} | wc -l`);
      const fileCount = parseInt(countResult.stdout.trim()) || 0;

      // Read tar file as binary using SDK's native binary support
      const tarContent = await sandbox.files.read(tarPath, { format: "bytes" });
      const buffer = Buffer.from(tarContent);

      console.log(`[GCS_STORAGE] Read tar.gz: ${buffer.length} bytes`);

      // Build file tree from tar listing
      const listResult = await sandbox.commands.run(`tar -tzf ${tarPath}`);
      const tree = this.buildTreeFromTarList(listResult.stdout, paths);

      // Upload archive to GCS
      const archivePath = `sandboxes/${userId}/${archiveId}/archive.tar.gz`;
      await this.bucket.file(archivePath).save(buffer, {
        contentType: "application/gzip",
      });

      // Create and upload manifest
      const manifest: Manifest = {
        archiveId,
        taskId,
        userId,
        paths,
        sizeBytes: buffer.length,
        fileCount,
        createdAt: new Date().toISOString(),
        tree,
      };

      const manifestPath = `sandboxes/${userId}/${archiveId}/manifest.json`;
      await this.bucket.file(manifestPath).save(JSON.stringify(manifest, null, 2), {
        contentType: "application/json",
      });

      // Cleanup temp tar file in sandbox
      await sandbox.commands.run(`rm -f ${tarPath}`);

      console.log(
        `[GCS_STORAGE] Saved ${archiveId}: ${buffer.length} bytes, ${fileCount} files`
      );

      return {
        success: true,
        archiveId,
        sizeBytes: buffer.length,
        paths,
      };
    } catch (error) {
      console.error(`[GCS_STORAGE] Save error:`, error);
      return {
        success: false,
        archiveId,
        sizeBytes: 0,
        paths,
        error: error instanceof Error ? error.message : "Save failed",
      };
    }
  }

  async restore(archiveId: string, sandbox: Sandbox): Promise<RestoreResult> {
    try {
      // Get manifest to find the user path
      const manifest = await this.getManifest(archiveId);
      if (!manifest) {
        return {
          success: false,
          fileCount: 0,
          sizeBytes: 0,
          error: `Archive ${archiveId} not found`,
        };
      }

      // Download archive from GCS
      const archivePath = `sandboxes/${manifest.userId}/${archiveId}/archive.tar.gz`;
      const [content] = await this.bucket.file(archivePath).download();

      // Write binary tar.gz directly to sandbox using SDK's native binary support
      const tempTarPath = `/tmp/${archiveId}.tar.gz`;
      await sandbox.files.write(tempTarPath, content.buffer as ArrayBuffer);

      // Extract to root (tar was created with paths relative to /)
      const extractResult = await sandbox.commands.run(
        `tar -xzf ${tempTarPath} -C /`,
        { timeoutMs: 60000 }
      );

      if (extractResult.exitCode !== 0) {
        return {
          success: false,
          fileCount: 0,
          sizeBytes: content.length,
          error: extractResult.stderr || "Failed to extract archive",
        };
      }

      // Cleanup temp file
      await sandbox.commands.run(`rm -f ${tempTarPath}`);

      console.log(
        `[GCS_STORAGE] Restored ${archiveId}: ${content.length} bytes, ${manifest.fileCount} files`
      );

      return {
        success: true,
        fileCount: manifest.fileCount,
        sizeBytes: content.length,
      };
    } catch (error) {
      console.error(`[GCS_STORAGE] Restore error:`, error);
      return {
        success: false,
        fileCount: 0,
        sizeBytes: 0,
        error: error instanceof Error ? error.message : "Restore failed",
      };
    }
  }

  async getFileTree(
    archiveId: string,
    rootPath?: string
  ): Promise<FileNode[] | null> {
    try {
      const manifest = await this.getManifest(archiveId);
      if (!manifest) return null;

      let tree = manifest.tree;

      // If rootPath provided, find that node and return its children
      if (rootPath) {
        const normalizedRoot = rootPath.replace(/\/$/, ""); // Remove trailing slash

        // Recursive function to find node by path
        const findNode = (nodes: typeof tree, targetPath: string): typeof tree[0] | null => {
          for (const node of nodes) {
            if (node.path === targetPath) return node;
            if (node.children) {
              const found = findNode(node.children, targetPath);
              if (found) return found;
            }
          }
          return null;
        };

        const rootNode = findNode(tree, normalizedRoot);
        if (rootNode?.children) {
          return rootNode.children;
        }
        // If not found as nested, check if it's a top-level node
        const topLevel = tree.find(n => n.path === normalizedRoot);
        if (topLevel?.children) {
          return topLevel.children;
        }
        return [];
      }

      return tree;
    } catch (error) {
      console.error(`[GCS_STORAGE] getFileTree error:`, error);
      return null;
    }
  }

  async getFileContent(
    archiveId: string,
    filePath: string
  ): Promise<string | null> {
    try {
      const manifest = await this.getManifest(archiveId);
      if (!manifest) return null;

      // Download and extract just the requested file
      const archivePath = `sandboxes/${manifest.userId}/${archiveId}/archive.tar.gz`;
      const [content] = await this.bucket.file(archivePath).download();

      // Use tar to extract just this file to stdout
      // This is a bit hacky but avoids downloading and parsing the whole archive
      // For a production system, consider storing files individually or using a temp sandbox

      // Normalize the file path for tar (remove leading slash)
      const tarFilePath = filePath.replace(/^\//, "");

      // Create a temporary extraction approach
      // Since we can't easily extract a single file from a buffer in Node,
      // we'll use the tar command-line approach with a temp file

      // For now, we'll store extracted content in a simple cache
      // A more robust solution would use streaming tar extraction

      // Use zlib and tar-stream for in-memory extraction
      const zlib = await import("zlib");
      const { Readable } = await import("stream");
      const tar = await import("tar-stream");

      return new Promise((resolve) => {
        const extract = tar.extract();
        let foundContent: string | null = null;

        extract.on("entry", (header, stream, next) => {
          const chunks: Buffer[] = [];

          if (header.name === tarFilePath || header.name === tarFilePath + "/") {
            stream.on("data", (chunk) => chunks.push(chunk));
            stream.on("end", () => {
              foundContent = Buffer.concat(chunks).toString("utf-8");
              next();
            });
          } else {
            stream.on("end", next);
            stream.resume();
          }
        });

        extract.on("finish", () => {
          resolve(foundContent);
        });

        extract.on("error", (err) => {
          console.error(`[GCS_STORAGE] tar extract error:`, err);
          resolve(null);
        });

        // Pipe the gzipped content through gunzip and then through tar extract
        const gunzip = zlib.createGunzip();

        // Handle gunzip errors to prevent server crash
        gunzip.on("error", (err) => {
          console.error(`[GCS_STORAGE] gunzip error:`, err);
          resolve(null);
        });

        Readable.from(content).pipe(gunzip).pipe(extract);
      });
    } catch (error) {
      console.error(`[GCS_STORAGE] getFileContent error:`, error);
      return null;
    }
  }

  async delete(archiveId: string): Promise<void> {
    try {
      const manifest = await this.getManifest(archiveId);
      if (!manifest) return;

      const prefix = `sandboxes/${manifest.userId}/${archiveId}/`;
      const [files] = await this.bucket.getFiles({ prefix });

      await Promise.all(files.map((file) => file.delete()));

      console.log(`[GCS_STORAGE] Deleted ${archiveId}`);
    } catch (error) {
      console.error(`[GCS_STORAGE] Delete error:`, error);
    }
  }

  /**
   * Get manifest for an archive by searching all user directories
   */
  private async getManifest(archiveId: string): Promise<Manifest | null> {
    try {
      // Get list of user directories using autoPaginate false to get prefixes
      const [, , apiResponse] = await this.bucket.getFiles({
        prefix: "sandboxes/",
        delimiter: "/",
        autoPaginate: false,
      });

      const userPrefixes = (apiResponse as { prefixes?: string[] })?.prefixes ?? [];

      // Try each user directory
      for (const userPrefix of userPrefixes) {
        const manifestPath = `${userPrefix}${archiveId}/manifest.json`;
        try {
          const [content] = await this.bucket.file(manifestPath).download();
          return JSON.parse(content.toString("utf-8"));
        } catch {
          // Not found in this directory, continue
        }
      }

      // Also try direct path if we can extract userId from somewhere
      return null;
    } catch (error) {
      console.error(`[GCS_STORAGE] getManifest error:`, error);
      return null;
    }
  }

  /**
   * Build a FileNode tree from tar listing output
   */
  private buildTreeFromTarList(
    tarOutput: string,
    rootPaths: string[]
  ): FileNode[] {
    const lines = tarOutput.trim().split("\n").filter(Boolean);
    const nodes = new Map<string, FileNode>();
    const roots: FileNode[] = [];

    for (const line of lines) {
      // Skip empty lines
      if (!line.trim()) continue;

      const fullPath = "/" + line.replace(/\/$/, ""); // Normalize path
      const isDir = line.endsWith("/");
      const parts = fullPath.split("/").filter(Boolean);
      const name = parts[parts.length - 1] ?? "";
      if (!name) continue; // Skip entries without a name

      const node: FileNode = {
        name,
        type: isDir ? "folder" : "file",
        path: fullPath,
        children: isDir ? [] : undefined,
      };

      nodes.set(fullPath, node);

      // Find parent
      const parentPath = "/" + parts.slice(0, -1).join("/");
      const parent = nodes.get(parentPath);

      if (parent && parent.children) {
        parent.children.push(node);
      } else if (parts.length === 1 || rootPaths.some((rp) => fullPath === rp)) {
        roots.push(node);
      }
    }

    // Sort children: folders first, then alphabetically
    const sortNodes = (nodes: FileNode[]) => {
      nodes.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === "folder" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      nodes.forEach((n) => {
        if (n.children) sortNodes(n.children);
      });
    };

    sortNodes(roots);

    return roots;
  }
}
