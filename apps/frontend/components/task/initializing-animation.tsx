"use client";

// Overlay disabled - no initialization animation shown
export default function InitializingAnimation({
  taskId,
  userMessageWrapperRef,
}: {
  taskId: string;
  userMessageWrapperRef: React.RefObject<HTMLButtonElement | null>;
}) {
  return null;
}
