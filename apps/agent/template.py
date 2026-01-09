"""
Claude Agent Sandbox Template

Builds from Dockerfile with:
- Ubuntu 22.04 base
- Node.js 22 (for Claude Code CLI)
- Python 3 with claude-agent-sdk
- Agent code at /app/src

Usage:
    cd apps/agent
    poetry run python template.py
"""

from pathlib import Path

from dotenv import load_dotenv

# Load .env from apps/server (for MORU_API_KEY)
env_path = Path(__file__).parent.parent / "server" / ".env"
load_dotenv(env_path)

from moru import Template, wait_for_timeout, default_build_logger

AGENT_DIR = Path(__file__).parent


def build_template():
    template_alias = "claude-agent"

    print("=" * 50)
    print("Building Claude Agent Template")
    print("=" * 50)
    print(f"\nTemplate alias: {template_alias}")
    print()

    template = (
        Template(file_context_path=str(AGENT_DIR))
        .from_dockerfile(str(AGENT_DIR / "Dockerfile"))
        .set_start_cmd("claude --version", wait_for_timeout(10_000))
    )

    build_info = Template.build(
        template,
        alias=template_alias,
        cpu_count=2,
        memory_mb=2048,
        on_build_logs=default_build_logger(),
    )

    print()
    print("=" * 50)
    print(f"Template ID: {build_info.template_id}")
    print(f"Alias: {build_info.alias}")
    print()
    print("Run agent: cd /app/src && python3 agent.py")


if __name__ == "__main__":
    build_template()
