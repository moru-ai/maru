import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import os from "os";

/**
 * GET /api/test/claude-sessions
 * Lists available Claude Code session files
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const sessionId = searchParams.get("sessionId");

  const claudeProjectsDir = path.join(os.homedir(), ".claude", "projects");

  try {
    // If sessionId is provided, load that specific session
    if (sessionId) {
      const entries = await loadSession(claudeProjectsDir, sessionId);
      return NextResponse.json({ entries });
    }

    // Otherwise, list available sessions
    const sessions = await listSessions(claudeProjectsDir);
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("Error reading Claude sessions:", error);
    return NextResponse.json(
      { error: "Failed to read sessions" },
      { status: 500 }
    );
  }
}

/**
 * List all available session files
 */
async function listSessions(
  baseDir: string
): Promise<Array<{ id: string; project: string; size: number; modified: Date }>> {
  const sessions: Array<{
    id: string;
    project: string;
    size: number;
    modified: Date;
  }> = [];

  try {
    const projects = await fs.readdir(baseDir);

    for (const project of projects) {
      const projectDir = path.join(baseDir, project);
      const stat = await fs.stat(projectDir);

      if (!stat.isDirectory()) continue;

      try {
        const files = await fs.readdir(projectDir);
        const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

        for (const file of jsonlFiles) {
          const filePath = path.join(projectDir, file);
          const fileStat = await fs.stat(filePath);

          sessions.push({
            id: `${project}/${file.replace(".jsonl", "")}`,
            project,
            size: fileStat.size,
            modified: fileStat.mtime,
          });
        }
      } catch {
        // Skip directories we can't read
        continue;
      }
    }

    // Sort by modified date, newest first
    sessions.sort(
      (a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime()
    );

    return sessions.slice(0, 50); // Return max 50 sessions
  } catch (error) {
    console.error("Error listing sessions:", error);
    return [];
  }
}

/**
 * Load a specific session by ID
 */
async function loadSession(
  baseDir: string,
  sessionId: string
): Promise<unknown[]> {
  // sessionId format: project/sessionUuid
  const [project, uuid] = sessionId.split("/");
  if (!project || !uuid) {
    throw new Error("Invalid session ID format");
  }

  const filePath = path.join(baseDir, project, `${uuid}.jsonl`);

  try {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.trim().split("\n");

    const entries: unknown[] = [];
    for (const line of lines) {
      if (line.trim()) {
        try {
          entries.push(JSON.parse(line));
        } catch {
          console.warn("Failed to parse line:", line.slice(0, 100));
        }
      }
    }

    return entries;
  } catch (error) {
    console.error("Error reading session file:", error);
    throw error;
  }
}
