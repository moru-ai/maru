"""Agent protocol types - generated from JSON schemas."""

from typing import TypeGuard

from .server_to_agent import (
    ServerToAgentMessage,
    ProcessStartCommand,
    SessionMessageCommand,
    SessionInterruptCommand,
    ProcessStopCommand,
    ContentBlock,
    TextContent,
    ImageContent,
    ImageSource,
)
from .agent_to_server import (
    AgentToServerMessage,
    ProcessReadyEvent,
    ProcessErrorEvent,
    ProcessStoppedEvent,
    SessionStartedEvent,
    SessionCompleteEvent,
    SessionInterruptedEvent,
    SessionErrorEvent,
    ResultData,
)


# Type guards for message discrimination
def is_process_start(msg: ServerToAgentMessage) -> TypeGuard[ProcessStartCommand]:
    return msg.get("type") == "process_start"


def is_session_message(msg: ServerToAgentMessage) -> TypeGuard[SessionMessageCommand]:
    return msg.get("type") == "session_message"


def is_session_interrupt(msg: ServerToAgentMessage) -> TypeGuard[SessionInterruptCommand]:
    return msg.get("type") == "session_interrupt"


def is_process_stop(msg: ServerToAgentMessage) -> TypeGuard[ProcessStopCommand]:
    return msg.get("type") == "process_stop"


__all__ = [
    # Server → Agent
    "ServerToAgentMessage",
    "ProcessStartCommand",
    "SessionMessageCommand",
    "SessionInterruptCommand",
    "ProcessStopCommand",
    "ContentBlock",
    "TextContent",
    "ImageContent",
    "ImageSource",
    # Agent → Server
    "AgentToServerMessage",
    "ProcessReadyEvent",
    "ProcessErrorEvent",
    "ProcessStoppedEvent",
    "SessionStartedEvent",
    "SessionCompleteEvent",
    "SessionInterruptedEvent",
    "SessionErrorEvent",
    "ResultData",
    # Type guards
    "is_process_start",
    "is_session_message",
    "is_session_interrupt",
    "is_process_stop",
]
