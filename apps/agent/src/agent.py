#!/usr/bin/env python3
"""
Maru Agent - Claude Agent SDK integration for moru sandbox.

Streaming pattern:
1. Read stdin, yield messages to client.query()
2. Process responses from client.receive_response() concurrently
3. Emit session_started when we get init message with session_id
"""

import asyncio
import json
import os
import sys
from collections.abc import AsyncGenerator

from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions, ResultMessage, SystemMessage

from protocol import (
    ServerToAgentMessage,
    SessionMessageCommand,
    ContentBlock,
    AgentToServerMessage,
    ProcessReadyEvent,
    ProcessErrorEvent,
    ProcessStoppedEvent,
    SessionStartedEvent,
    SessionCompleteEvent,
    SessionInterruptedEvent,
    ResultData,
    is_process_start,
    is_session_message,
    is_session_interrupt,
    is_process_stop,
)


def emit(msg: AgentToServerMessage) -> None:
    """Emit JSON message to stdout."""
    print(json.dumps(msg), flush=True)


class Agent:
    def __init__(self, workspace: str):
        self.workspace = workspace
        self.client: ClaudeSDKClient | None = None
        self.current_session_id: str | None = None
        self.reader: asyncio.StreamReader | None = None
        self.should_stop = False

    async def setup_stdin(self) -> None:
        """Setup async stdin reader."""
        loop = asyncio.get_event_loop()
        self.reader = asyncio.StreamReader()
        await loop.connect_read_pipe(
            lambda: asyncio.StreamReaderProtocol(self.reader),
            sys.stdin
        )

    async def read_message(self) -> ServerToAgentMessage | None:
        """Read one message from stdin."""
        line = await self.reader.readline()
        if not line:
            return None
        try:
            return json.loads(line.decode().strip())
        except json.JSONDecodeError:
            return None

    async def message_stream(self) -> AsyncGenerator[dict, None]:
        """Yield messages from stdin to SDK."""
        while not self.should_stop:
            msg = await self.read_message()
            if msg is None:
                self.should_stop = True
                return

            if is_session_message(msg):
                content = self.parse_content(msg)
                yield {
                    "type": "user",
                    "message": {
                        "role": "user",
                        "content": content if isinstance(content, list) else [{"type": "text", "text": content}]
                    }
                }

            elif is_session_interrupt(msg):
                if self.client:
                    await self.client.interrupt()
                emit(SessionInterruptedEvent(
                    type="session_interrupted",
                    session_id=self.current_session_id or "unknown"
                ))

            elif is_process_stop(msg):
                self.should_stop = True
                return

    def parse_content(self, msg: SessionMessageCommand) -> list[ContentBlock] | str:
        """Parse message content."""
        if "text" in msg:
            return msg["text"]
        if "content" in msg:
            return msg["content"]
        return ""

    async def process_responses(self) -> None:
        """Process responses from SDK."""
        async for message in self.client.receive_response():
            # Init message contains session_id
            if isinstance(message, SystemMessage) and message.subtype == "init":
                self.current_session_id = message.data.get("session_id")
                emit(SessionStartedEvent(
                    type="session_started",
                    session_id=self.current_session_id or "unknown"
                ))

            # Result message means turn complete
            elif isinstance(message, ResultMessage):
                self.current_session_id = message.session_id
                result = ResultData(
                    duration_ms=message.duration_ms,
                    duration_api_ms=message.duration_api_ms,
                    total_cost_usd=message.total_cost_usd,
                    num_turns=message.num_turns,
                )
                emit(SessionCompleteEvent(
                    type="session_complete",
                    session_id=self.current_session_id,
                    result=result
                ))

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

        # Create client
        resume_session_id = msg.get("session_id")
        fork = msg.get("fork", False)

        options = ClaudeAgentOptions(
            allowed_tools=["Read", "Write", "Edit", "Bash", "Grep", "Glob"],
            permission_mode="bypassPermissions",
            cwd=self.workspace,
            resume=resume_session_id,
            fork_session=fork,
        )

        try:
            async with ClaudeSDKClient(options) as client:
                self.client = client
                self.current_session_id = resume_session_id

                emit(ProcessReadyEvent(
                    type="process_ready",
                    workspace=self.workspace,
                    session_id=self.current_session_id or "pending",
                    resumed=resume_session_id is not None,
                    forked=fork,
                ))

                # Run query and response processing concurrently
                await asyncio.gather(
                    client.query(self.message_stream()),
                    self.process_responses()
                )

        except asyncio.CancelledError:
            pass
        except Exception as e:
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
