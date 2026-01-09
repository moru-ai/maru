import { getSessionEntries } from "@/lib/db-operations/get-session-entries";
import { verifyTaskOwnership } from "@/lib/auth/verify-task-ownership";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;

    const { error } = await verifyTaskOwnership(taskId);
    if (error) return error;

    const entries = await getSessionEntries(taskId);

    return NextResponse.json(entries);
  } catch (error) {
    console.error("Error fetching session entries:", error);
    return NextResponse.json(
      { error: "Failed to fetch session entries" },
      { status: 500 }
    );
  }
}
