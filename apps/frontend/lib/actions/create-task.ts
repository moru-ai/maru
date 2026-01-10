"use server";

import { auth } from "@/lib/auth/auth";
import { MessageRole, prisma, Task } from "@repo/db";
import { headers } from "next/headers";
import { after } from "next/server";
import { z, ZodIssue } from "zod";
import { generateTaskTitleAndBranch } from "./generate-title-branch";
import { generateTaskId, MAX_TASKS_PER_USER_PRODUCTION } from "@repo/types";
import { makeBackendRequest } from "../make-backend-request";

const createTaskSchema = z.object({
  message: z
    .string()
    .min(1, "Message is required")
    .max(100000, "Message too long"),
  model: z.string().min(1, "Model is required"),
});

export async function createTask(formData: FormData) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const rawData = {
    message: formData.get("message") as string,
    model: formData.get("model") as string,
  };
  const validation = createTaskSchema.safeParse(rawData);
  if (!validation.success) {
    const errorMessage = validation.error.issues
      .map((err: ZodIssue) => err.message)
      .join(", ");
    throw new Error(`Validation failed: ${errorMessage}`);
  }

  const { message, model } = validation.data;

  // Check task limit in production only
  if (process.env.NODE_ENV === "production") {
    const activeTaskCount = await prisma.task.count({
      where: {
        userId: session.user.id,
        status: {
          notIn: ["COMPLETED", "FAILED", "ARCHIVED"]
        }
      }
    });

    if (activeTaskCount >= MAX_TASKS_PER_USER_PRODUCTION) {
      throw new Error(`You have reached the maximum of ${MAX_TASKS_PER_USER_PRODUCTION} active tasks. Please complete or archive existing tasks to create new ones.`);
    }
  }

  const taskId = generateTaskId();
  let task: Task;

  try {
    // Generate a title for the task
    const { title } = await generateTaskTitleAndBranch(taskId, message);

    // Create the task
    task = await prisma.task.create({
      data: {
        id: taskId,
        title,
        status: "INITIALIZING",
        user: {
          connect: {
            id: session.user.id,
          },
        },
        messages: {
          create: {
            content: message,
            role: MessageRole.USER,
            sequence: 1,
            llmModel: model,
          },
        },
      },
    });

    // Schedule the backend API call and title generation to happen after the response is sent
    after(async () => {
      try {
        // Initiate the task on the backend
        // Forward cookies from the original request
        const requestHeaders = await headers();
        const cookieHeader = requestHeaders.get("cookie");

        const response = await makeBackendRequest(
          `/api/tasks/${task.id}/initiate`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(cookieHeader && { Cookie: cookieHeader }),
            },
            body: JSON.stringify({
              message,
              model,
              userId: session.user.id,
            }),
          }
        );

        if (!response.ok) {
          console.error("Failed to initiate task:", await response.text());
        }
      } catch (error) {
        console.error("Error initiating task:", error);
      }
    });
  } catch (error) {
    console.error("Failed to create task:", error);
    throw new Error("Failed to create task");
  }

  return task.id;
}
