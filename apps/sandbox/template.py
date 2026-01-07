"""
Shadow Agent Sandbox Template

Builds a Moru sandbox template with:
- Ubuntu 22.04 base
- Git for repository operations
- Node.js 22 for JavaScript/TypeScript projects
- Python 3.11+ for Python projects
- GitHub CLI (gh) for PR operations
- Common development tools

Usage:
    cd sandbox/
    poetry install
    poetry run python template.py
"""

import os
from dotenv import load_dotenv
from pathlib import Path

# Load .env from apps/server (for MORU_API_KEY)
env_path = Path(__file__).parent.parent / "server" / ".env"
load_dotenv(env_path)

from moru import Template, wait_for_timeout, default_build_logger


def build_template():
    """Build the shadow-agent template."""

    template_alias = "shadow-agent"

    print("=" * 50)
    print("Building Shadow Agent Template")
    print("=" * 50)
    print(f"\nTemplate alias: {template_alias}")
    print()

    # Define the template using Ubuntu as base
    # Keeping it minimal for faster builds
    template = (
        Template()
        .from_image("ubuntu:22.04")
        # Install system dependencies (git is essential for repo operations)
        .run_cmd(
            "apt-get update && "
            "DEBIAN_FRONTEND=noninteractive apt-get install -y "
            "curl ca-certificates xz-utils git build-essential "
            "python3 python3-pip python3-venv "
            "&& rm -rf /var/lib/apt/lists/*"
        )
        # Install Node.js 22 via binary (no apt required)
        .run_cmd(
            "curl -fsSL https://nodejs.org/dist/v22.12.0/node-v22.12.0-linux-x64.tar.xz "
            "| tar -xJ -C /usr/local --strip-components=1"
        )
        # Install pnpm globally
        .run_cmd("npm install -g pnpm")
        # Configure git defaults
        .run_cmd("git config --system init.defaultBranch main")
        # Mark /workspace as safe directory (avoids "dubious ownership" errors)
        .run_cmd("git config --system --add safe.directory /workspace")
        # Create workspace directory with proper permissions for user
        # (Moru runs commands as 'user' uid 1000, so we need write access)
        .run_cmd("mkdir -p /workspace && chmod 777 /workspace")
        # Set working directory
        .set_workdir("/workspace")
        # Ready immediately - no start command needed
        .set_ready_cmd(wait_for_timeout(1000))
    )

    # Build the template
    import time
    max_retries = 3
    retry_delay = 30

    for attempt in range(max_retries):
        try:
            print(f"Build attempt {attempt + 1}/{max_retries}...")
            build_info = Template.build(
                template,
                alias=template_alias,
                cpu_count=2,
                memory_mb=2048,
                skip_cache=(attempt > 0),  # Skip cache on retry
                on_build_logs=default_build_logger(),
            )
            print()
            print("=" * 50)
            print("Template build completed!")
            print("=" * 50)
            print(f"Template ID: {build_info.template_id}")
            print(f"Alias: {build_info.alias}")
            break
        except Exception as e:
            if "504" in str(e) and attempt < max_retries - 1:
                print(f"Gateway timeout. Waiting {retry_delay}s before retry...")
                time.sleep(retry_delay)
                retry_delay *= 2  # Exponential backoff
            else:
                raise
    print()
    print("You can now use this template in Shadow by setting:")
    print(f'  MORU_TEMPLATE_ID={template_alias}')
    print()
    print("Or create sandboxes directly:")
    print(f'  Sandbox.create("{template_alias}")')


if __name__ == "__main__":
    build_template()
