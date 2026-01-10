import { Router } from "express";
import { prisma } from "@repo/db";
import { createSandboxStorage, isSandboxStorageConfigured } from "../services/storage";

const router = Router();

// Get file tree for a task workspace (from storage)
router.get("/:taskId/files/tree", async (req, res) => {
  try {
    const { taskId } = req.params;

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        workspaceArchiveId: true,
      },
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        error: "Task not found",
      });
    }

    // Serve from storage
    if (task.workspaceArchiveId && isSandboxStorageConfigured()) {
      const storage = createSandboxStorage();
      const tree = await storage.getFileTree(task.workspaceArchiveId, "/workspace");
      return res.json({
        success: true,
        tree: tree ?? [],
      });
    }

    // No workspace saved yet
    res.json({
      success: true,
      tree: [],
    });
  } catch (error) {
    console.error("[FILE_TREE_API_ERROR]", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Get file content for a task workspace (from storage)
router.get("/:taskId/files/content", async (req, res) => {
  try {
    const { taskId } = req.params;
    const filePath = req.query.path as string;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: "File path is required",
      });
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        workspaceArchiveId: true,
      },
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        error: "Task not found",
      });
    }

    // Serve from storage
    if (task.workspaceArchiveId && isSandboxStorageConfigured()) {
      const storage = createSandboxStorage();
      const content = await storage.getFileContent(task.workspaceArchiveId, filePath);

      if (content !== null) {
        return res.json({
          success: true,
          content,
          path: filePath,
        });
      }
    }

    // File not found in storage
    res.status(404).json({
      success: false,
      error: "File not found",
    });
  } catch (error) {
    console.error("[FILE_CONTENT_API_ERROR]", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// GET /api/tasks/:taskId/file-changes - Get file changes (git functionality removed)
router.get("/:taskId/file-changes", async (req, res) => {
  try {
    const { taskId } = req.params;

    // Validate task exists
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        status: true,
      },
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        error: "Task not found",
      });
    }

    // Git functionality has been removed, return empty changes
    res.json({
      success: true,
      fileChanges: [],
      diffStats: { additions: 0, deletions: 0, totalFiles: 0 },
    });
  } catch (error) {
    console.error(
      `[FILE_CHANGES_DEBUG] Error in file-changes route - taskId: ${req.params.taskId}`,
      error
    );
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export { router as filesRouter };
