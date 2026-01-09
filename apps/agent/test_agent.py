#!/usr/bin/env python3
"""
Test script for the Maru Agent.

Usage:
    export ANTHROPIC_API_KEY=sk-ant-...
    python test_agent.py
"""

import subprocess
import json
import sys
import time


def send(proc, msg: dict) -> None:
    """Send a message to the agent."""
    line = json.dumps(msg) + "\n"
    print(f">>> {msg}")
    proc.stdin.write(line)
    proc.stdin.flush()


def read_responses(proc, timeout: float = 30) -> None:
    """Read responses from the agent until timeout or process ends."""
    import select

    start = time.time()
    while time.time() - start < timeout:
        # Check if there's data to read (non-blocking)
        if proc.stdout in select.select([proc.stdout], [], [], 0.1)[0]:
            line = proc.stdout.readline()
            if not line:
                break
            try:
                msg = json.loads(line.strip())
                print(f"<<< {msg}")

                # Show session_id if available
                if msg.get("type") == "session_complete":
                    print(f"    (session complete)")
                    return
                if msg.get("type") == "process_stopped":
                    return
            except json.JSONDecodeError:
                print(f"<<< (raw) {line.strip()}")

        # Check if process ended
        if proc.poll() is not None:
            break


def main():
    print("Starting agent...")

    # Start the agent process
    proc = subprocess.Popen(
        ["python", "src/agent.py"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,  # Line buffered
    )

    try:
        # 1. Send process_start
        send(proc, {"type": "process_start"})
        read_responses(proc, timeout=5)

        # 2. Send a message
        send(proc, {
            "type": "session_message",
            "text": "What is 2 + 2? Just answer with the number."
        })
        read_responses(proc, timeout=60)

        # 3. Send process_stop
        send(proc, {"type": "process_stop"})
        read_responses(proc, timeout=5)

    except KeyboardInterrupt:
        print("\nInterrupted")
    finally:
        proc.terminate()
        proc.wait()

        # Print any stderr
        stderr = proc.stderr.read()
        if stderr:
            print(f"\n=== STDERR ===\n{stderr}")


if __name__ == "__main__":
    main()
