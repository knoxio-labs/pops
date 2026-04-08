#!/bin/bash
set -e

# Setup GitHub Actions self-hosted runner on the POPS server
# Usage: ./scripts/setup-github-runner.sh <GITHUB_TOKEN>
#
# Configure runner name/labels via .env:
#   POPS_RUNNER_NAME=pops-runner
#   POPS_RUNNER_LABELS=self-hosted,linux,x64

if [ -z "$1" ]; then
    echo "Usage: $0 <GITHUB_TOKEN>"
    echo ""
    echo "Get token from: Settings > Actions > Runners > New self-hosted runner"
    exit 1
fi

# Load .env if it exists
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -f "$SCRIPT_DIR/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$SCRIPT_DIR/.env"
    set +a
fi

RUNNER_TOKEN="$1"
RUNNER_VERSION="2.313.0"
WORK_DIR="/opt/pops/actions-runner"
RUNNER_NAME="${POPS_RUNNER_NAME:-pops-runner}"
RUNNER_LABELS="${POPS_RUNNER_LABELS:-self-hosted,linux,x64}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "GitHub Actions Runner Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Name:   $RUNNER_NAME"
echo "  Labels: $RUNNER_LABELS"

# Create runner directory
echo "Creating runner directory..."
sudo mkdir -p "$WORK_DIR"
sudo chown "$USER:$USER" "$WORK_DIR"
cd "$WORK_DIR"

# Download runner
echo "Downloading runner v${RUNNER_VERSION}..."
curl -o actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz -L \
    "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"

# Extract runner
echo "Extracting runner..."
tar xzf "./actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"

# Configure runner
echo "Configuring runner..."
REPO_URL=$(cd "$SCRIPT_DIR" && git remote get-url origin | sed 's/git@github.com:/https:\/\/github.com\//' | sed 's/\.git$//')
./config.sh \
    --url "$REPO_URL" \
    --token "$RUNNER_TOKEN" \
    --name "$RUNNER_NAME" \
    --labels "$RUNNER_LABELS" \
    --work _work \
    --replace

# Install dependencies
echo "Installing dependencies..."
sudo ./bin/installdependencies.sh

# Install as systemd service
echo "Installing systemd service..."
sudo ./svc.sh install

# Start service
echo "Starting runner service..."
sudo ./svc.sh start

# Check status
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Runner setup complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
sudo ./svc.sh status

echo ""
echo "Next steps:"
echo "1. Verify runner appears in GitHub repo Settings > Actions > Runners"
echo "2. Push a commit to main to trigger deployment"
echo "3. Monitor logs: sudo journalctl -u actions.runner.* -f"
