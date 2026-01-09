FROM ubuntu:22.04

# Install system dependencies
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y \
    curl ca-certificates xz-utils git build-essential \
    python3 python3-pip python3-venv && \
    rm -rf /var/lib/apt/lists/*

# Install Node.js 22
RUN curl -fsSL https://nodejs.org/dist/v22.12.0/node-v22.12.0-linux-x64.tar.xz \
    | tar -xJ -C /usr/local --strip-components=1

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Install claude-agent-sdk
RUN pip3 install claude-agent-sdk

# Copy agent source code
COPY src /app/src

# Configure git
RUN git config --system init.defaultBranch main && \
    git config --system --add safe.directory '*'

# Create workspace
RUN mkdir -p /workspace && chmod 777 /workspace
WORKDIR /workspace
