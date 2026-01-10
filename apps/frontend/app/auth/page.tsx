"use client";

import { LandingPagePromptForm } from "@/components/chat/prompt-form/demo-prompt-form";
import { GithubLogo } from "@/components/graphics/github/github-logo";
import { LogoBurst } from "@/components/graphics/logo/logo-burst";
import { NewTaskAnimation } from "@/components/task/new-task-animation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/auth-client";

export default function AuthPage() {
  const handleGithubSignIn = async () => {
    try {
      await authClient.signIn.social({
        provider: "github",
        callbackURL: "/",
      });
    } catch (error) {
      console.error("Sign in error:", error);
    }
  };

  return (
    <div className="@container relative flex size-full h-svh flex-col items-center overflow-hidden">
      <NewTaskAnimation className="top-52" />
      <div className="relative z-0 mx-auto mt-32 flex w-full max-w-xl flex-col items-center gap-10 overflow-hidden p-4">
        <div className="font-departureMono flex select-none items-center gap-4 text-3xl font-medium tracking-tighter">
          <LogoBurst size="lg" />
          <span className="@[400px]:inline hidden">Code with </span>
          <span className="@min-[400px]:text-muted-foreground inline-flex items-center gap-2">
            Maru
          </span>
        </div>

        <div className="from-background to-background/25 animate-in fade-in fill-mode-both ease-out-quad delay-1500 top-18 absolute left-0 z-10 flex h-36 w-full items-center justify-center bg-gradient-to-t duration-500">
          <Button
            onClick={handleGithubSignIn}
            className="ring-offset-background ring-ring text-base font-medium ring-1 ring-offset-2"
          >
            <GithubLogo className="size-4" />
            Get Started
          </Button>
        </div>

        <LandingPagePromptForm />

        <div className="animate-in fade-in fill-mode-both ease-out-quad delay-2000 mt-6 flex flex-col gap-2 duration-500">
          <div className="text-muted-foreground text-center text-sm">
            Maru is an{" "}
            <a
              href="https://github.com/moru-ai/maru"
              target="_blank"
              className="text-foreground inline-block cursor-pointer font-medium hover:underline hover:opacity-90"
              rel="noreferrer"
            >
              open-source
            </a>{" "}
            background coding agent. Designed to understand, reason about, and
            contribute to existing codebases.
          </div>
        </div>
      </div>
    </div>
  );
}
