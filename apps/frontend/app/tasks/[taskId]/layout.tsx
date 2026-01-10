import { SidebarViews } from "@/components/sidebar";
import { AgentEnvironmentProvider } from "@/components/agent-environment/agent-environment-context";
import { TaskSocketProvider } from "@/contexts/task-socket-context";
import { getUser } from "@/lib/auth/get-user";
import { getTasks } from "@/lib/db-operations/get-tasks";
import { db } from "@repo/db";
import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from "@tanstack/react-query";
import { notFound } from "next/navigation";

export default async function TaskLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ taskId: string }>;
}>) {
  const { taskId } = await params;

  const user = await getUser();

  // Fetch only essential data - session entries and file changes are fetched client-side
  const [initialTasks, task] = await Promise.all([
    user ? getTasks(user.id) : [],
    db.task.findUnique({ where: { id: taskId } }),
  ]);

  if (!task) {
    notFound();
  }

  const queryClient = new QueryClient();

  // Prefetch task data synchronously (already have data, no extra queries)
  queryClient.setQueryData(["task", taskId], {
    task,
    fileChanges: [],
    diffStats: { additions: 0, deletions: 0, totalFiles: 0 },
  });
  queryClient.setQueryData(["task-title", taskId], task.title);
  queryClient.setQueryData(["task-status", taskId], {
    status: task.status,
    initStatus: task.initStatus,
    initializationError: task.initializationError,
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <TaskSocketProvider taskId={taskId}>
        <AgentEnvironmentProvider taskId={taskId}>
          <SidebarViews initialTasks={initialTasks} currentTaskId={task.id} />
          {children}
        </AgentEnvironmentProvider>
      </TaskSocketProvider>
    </HydrationBoundary>
  );
}
