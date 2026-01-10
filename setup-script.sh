#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
GRAY='\033[0;37m'
NC='\033[0m' # No Color

# Helper function to ask questions (with default value)
ask() {
    local question="$1"
    local default="$2"
    local answer
    
    if [ -n "$default" ]; then
        echo -n -e "${BLUE}${question}${NC} [${GRAY}${default}${NC}]: " >&2
    else
        echo -n -e "${BLUE}${question}${NC}: " >&2
    fi
    
    read answer
    if [ -z "$answer" ]; then
        echo "$default"
    else
        echo "$answer"
    fi
}

# Helper function to ask for required fields (with no default value)
ask_required() {
    local question="$1"
    local description="$2"
    local value=""
    
    while [ -z "$value" ]; do
        if [ -n "$description" ]; then
            echo -e "\n${YELLOW}${description}${NC}" >&2
        fi
        echo -n -e "${BLUE}${question}${NC}: " >&2
        read value
        if [ -z "$value" ]; then
            echo -e "${RED}[!] This field is required. Please enter a value.${NC}" >&2
        fi
    done
    echo "$value"
}

main() {
    echo -e "${GREEN}Maru Environment Setup${NC}"
    echo "============================"
    echo
    echo "This script will help you set up your environment variables."
    echo

    proceed=$(ask "Ready to proceed? (y/N)" "N")
    if [ "$(echo "$proceed" | tr '[:upper:]' '[:lower:]')" != "y" ]; then
        echo "Setup cancelled."
        exit 0
    fi

    # Database Configuration
    echo -e "\n${GREEN}Database Configuration${NC}"
    echo "****************************************************"
    DATABASE_URL=$(ask "Database URL" "postgres://postgres:@127.0.0.1:5432/maru_dev")


    # Pinecone Configuration
    echo -e "\n${GREEN}Pinecone Configuration${NC}"
    echo "****************************************************"
    echo "Get your API key from: https://app.pinecone.io/"
    echo "Warning: If not provided, you will not be able to use indexing."
    PINECONE_API_KEY=$(ask "Pinecone API Key")
    PINECONE_INDEX_NAME=$(ask "Pinecone Index Name" "maru")

    # GitHub Credentials
    echo -e "\n${GREEN}GitHub Credentials${NC}"
    echo "****************************************************"
    echo "See this guide for more information: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authenticating-to-the-rest-api-with-an-oauth-app"
    GITHUB_CLIENT_ID=$(ask_required "GitHub Client ID")
    GITHUB_CLIENT_SECRET=$(ask_required "GitHub Client Secret")
    echo "See this guide for more information: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens"
    echo "Ensure that your token has the ability to: read contents of repositories (Select 'Contents' in the 'Select scopes' dropdown)"
    GITHUB_PERSONAL_TOKEN=$(ask_required "GitHub Personal Access Token")

    # Authentication Configuration
    echo -e "\n${GREEN}Authentication Configuration${NC}"
    echo "****************************************************"
    gen_better_auth_secret() {
        openssl rand -base64 32
    }
    default_secret="$(gen_better_auth_secret)"
    echo "Generated random BetterAuth secret automatically."
    BETTER_AUTH_SECRET="$default_secret"

    # Local Development
    echo -e "\n${GREEN}Local Development${NC}"
    echo "****************************************************"
    echo "Directory where local agent workspaces will be created:"
    WORKSPACE_DIR=$(ask "Workspace Directory (absolute path)" "$(pwd)/maru-worktree")

    # Server Configuration
    echo -e "\n${GREEN}Server Configuration${NC}"
    echo "****************************************************"
    NEXT_PUBLIC_SERVER_URL=$(ask "Frontend Server URL" "http://localhost:4000")

    # Optional: Force GitHub App for frontend
    echo "Defaulting FORCE_GITHUB_APP to false. Only set to true if you would like to create your own GitHub App."
    NEXT_PUBLIC_FORCE_GITHUB_APP="false"

    # Create server .env file
    echo -e "\n${GREEN}Creating server .env file...${NC}"

    cat > "apps/server/.env" << EOF
DATABASE_URL="${DATABASE_URL}"

PINECONE_API_KEY="${PINECONE_API_KEY}"
PINECONE_INDEX_NAME="${PINECONE_INDEX_NAME}"

GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID}
GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}
GITHUB_PERSONAL_TOKEN=${GITHUB_PERSONAL_TOKEN}

WORKSPACE_DIR=${WORKSPACE_DIR}
EOF

    echo -e "${GREEN} Created apps/server/.env${NC}"

    # Create frontend .env file
    echo -e "${GREEN}Creating frontend .env file...${NC}"
    
    cat > "apps/frontend/.env" << EOF
NEXT_PUBLIC_SERVER_URL="${NEXT_PUBLIC_SERVER_URL}"
NEXT_PUBLIC_FORCE_GITHUB_APP=${NEXT_PUBLIC_FORCE_GITHUB_APP}

BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}

GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID}
GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}
GITHUB_PERSONAL_TOKEN=${GITHUB_PERSONAL_TOKEN}

NEXT_PUBLIC_FORCE_GITHUB_APP=${NEXT_PUBLIC_FORCE_GITHUB_APP}


DATABASE_URL="${DATABASE_URL}"
EOF

    echo -e "${GREEN} Created apps/frontend/.env${NC}"

    # Create packages/db .env file
    echo -e "${GREEN}Creating packages/db/.env file...${NC}"
    if [ -f "packages/db/.env.template" ]; then
        cp "packages/db/.env.template" "packages/db/.env"
        echo -e "${GREEN} Created packages/db/.env from template${NC}"
    else
        cat > "packages/db/.env" << EOF
DATABASE_URL="${DATABASE_URL}"
EOF
        echo -e "${YELLOW} packages/db/.env.template not found; created packages/db/.env with DATABASE_URL only.${NC}"
    fi

    echo -e "\n${GREEN} Setup Complete!${NC}"
    echo "****************************************************"
    echo "Your environment files have been created:"
    echo "  apps/server/.env"
    echo "  apps/frontend/.env"
    echo "  packages/db/.env"
    echo -e "\n${YELLOW} Next Steps:${NC}"
    echo "1. Make sure your PostgreSQL database is running"
    echo "2. Run database migrations: \`npm run generate\` then \`npm run db:push\` in the /packages/db directory"
    echo "3. Start the development servers"
    echo -e "\n${RED} Security Note:${NC}"
    echo "Never commit .env files to version control!"
    echo "They contain sensitive credentials."
}

trap 'echo -e "\n\nSetup cancelled."; exit 130' INT

if [ ! -f "apps/server/.env.template" ] || [ ! -f "apps/frontend/.env.template" ]; then
    echo -e "${RED}[!] Error: .env.template files not found.${NC}"
    echo "Please run this script from the root of the Maru project."
    exit 1
fi

main