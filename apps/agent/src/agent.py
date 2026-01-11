#!/usr/bin/env python3
"""
Maru Agent - Claude Agent SDK integration for moru sandbox.

Simplified single-turn pattern using query() function:
1. Read process_start from stdin
2. Read session_message from stdin
3. Call query() with prompt and options
4. Iterate messages until ResultMessage
5. Done
"""

import asyncio
import json
import os
import sys

from claude_agent_sdk import query, ClaudeAgentOptions, ResultMessage, SystemMessage, ProcessError

from protocol import (
    AgentToServerMessage,
    ProcessReadyEvent,
    ProcessErrorEvent,
    ProcessStoppedEvent,
    SessionStartedEvent,
    SessionCompleteEvent,
    SessionErrorEvent,
    ResultData,
    is_process_start,
    is_session_message,
)


def emit(msg: AgentToServerMessage) -> None:
    """Emit JSON message to stdout."""
    print(json.dumps(msg), flush=True)


class Agent:
    def __init__(self, workspace: str):
        self.workspace = workspace
        self.reader: asyncio.StreamReader | None = None

    async def setup_stdin(self) -> None:
        """Setup async stdin reader."""
        loop = asyncio.get_event_loop()
        self.reader = asyncio.StreamReader()
        await loop.connect_read_pipe(
            lambda: asyncio.StreamReaderProtocol(self.reader),
            sys.stdin
        )

    async def read_message(self) -> dict | None:
        """Read one message from stdin."""
        try:
            line = await self.reader.readline()
            if not line:
                return None
            return json.loads(line.decode().strip())
        except json.JSONDecodeError:
            return None

    def parse_content(self, msg: dict) -> str:
        """Parse message content to string."""
        if "text" in msg:
            return msg["text"]
        if "content" in msg:
            content = msg["content"]
            if isinstance(content, str):
                return content
            # Handle content blocks
            if isinstance(content, list):
                texts = []
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "text":
                        texts.append(block.get("text", ""))
                    elif isinstance(block, str):
                        texts.append(block)
                return "\n".join(texts)
        return ""

    async def run(self) -> None:
        """Main entry point."""
        await self.setup_stdin()

        # Wait for process_start
        msg = await self.read_message()
        if msg is None:
            return

        if not is_process_start(msg):
            emit(ProcessErrorEvent(type="process_error", message="Expected process_start"))
            return

        # Create client options
        resume_session_id = msg.get("session_id")
        fork = msg.get("fork", False)

        options = ClaudeAgentOptions(
            allowed_tools=["Read", "Write", "Edit", "Bash", "Grep", "Glob"],
            permission_mode="bypassPermissions",
            cwd=self.workspace,
            resume=resume_session_id,
            fork_session=fork,
            setting_sources=["user"],
        )

        emit(ProcessReadyEvent(
            type="process_ready",
            workspace=self.workspace,
            session_id=resume_session_id or "pending",
            resumed=resume_session_id is not None,
            forked=fork,
        ))

        # Wait for session_message
        msg = await self.read_message()
        if msg is None or not is_session_message(msg):
            emit(ProcessErrorEvent(type="process_error", message="Expected session_message"))
            return

        # Parse prompt
        prompt = self.parse_content(msg)

        try:
            current_session_id = resume_session_id
            got_result = False

            # Use query() function - it handles connection lifecycle automatically
            async for message in query(prompt=prompt, options=options):
                # Init message contains session_id
                if isinstance(message, SystemMessage) and message.subtype == "init":
                    current_session_id = message.data.get("session_id")
                    emit(SessionStartedEvent(
                        type="session_started",
                        session_id=current_session_id or "unknown"
                    ))

                # Result message means complete
                elif isinstance(message, ResultMessage):
                    got_result = True
                    current_session_id = message.session_id
                    result = ResultData(
                        duration_ms=message.duration_ms,
                        duration_api_ms=message.duration_api_ms,
                        total_cost_usd=message.total_cost_usd,
                        num_turns=message.num_turns,
                    )
                    emit(SessionCompleteEvent(
                        type="session_complete",
                        session_id=current_session_id,
                        result=result
                    ))
                    # query() iterator will terminate after ResultMessage

                # Process error (e.g., billing error, API error)
                elif isinstance(message, ProcessError):
                    emit(SessionErrorEvent(
                        type="session_error",
                        message=message.message
                    ))
                    return

            # If query() ended without ResultMessage, emit completion anyway
            if not got_result:
                print(f"[AGENT] Warning: query() ended without ResultMessage", file=sys.stderr, flush=True)
                emit(SessionCompleteEvent(
                    type="session_complete",
                    session_id=current_session_id or "unknown",
                    result=ResultData(
                        duration_ms=0,
                        duration_api_ms=0,
                        total_cost_usd=0,
                        num_turns=0,
                    )
                ))

        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"[AGENT] Exception: {e}", file=sys.stderr, flush=True)
            emit(ProcessErrorEvent(type="process_error", message=str(e)))

        emit(ProcessStoppedEvent(type="process_stopped", reason="stop"))


async def main() -> None:
    workspace = os.environ.get("WORKSPACE_DIR", os.getcwd())

    try:
        agent = Agent(workspace)
        await agent.run()
    except Exception as e:
        emit(ProcessErrorEvent(type="process_error", message=str(e)))
        emit(ProcessStoppedEvent(type="process_stopped", reason="error"))


if __name__ == "__main__":
    asyncio.run(main())
