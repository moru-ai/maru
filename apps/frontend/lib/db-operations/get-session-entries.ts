import { db, type SessionEvent } from "@repo/db";
import type { ClaudeCode } from "@repo/types";

type SessionEntry = ClaudeCode.SessionEntry;

/**
 * Get all session entries for a task
 * - Uses Prisma SessionEvent for DB query
 * - Returns SessionEntry[] (the typed data field)
 */
export async function getSessionEntries(taskId: string): Promise<SessionEntry[]> {
  try {
    const events = await db.sessionEvent.findMany({
      where: { taskId },
      orderBy: { timestamp: "asc" },
    });

    return events.map((event: SessionEvent) => event.data as SessionEntry);
  } catch (err) {
    console.error("Failed to fetch session entries", err);
    return [];
  }
}
