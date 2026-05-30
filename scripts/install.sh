#!/usr/bin/env bash
# opencode fork installer — GitHub Releases
# Usage: curl -fsSL https://raw.githubusercontent.com/menoxz/opencode/dev/scripts/install.sh | bash
# Or:  bash <(curl -fsSL https://raw.githubusercontent.com/menoxz/opencode/dev/scripts/install.sh)

set -euo pipefail

REPO="menoxz/opencode"
APP="opencode"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.opencode/bin}"
VERSION="${VERSION:-latest}"

# --- detect platform ---
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$OS" in
  linux)  TARGET="linux-x64" ;;
  darwin) TARGET="darwin-x64" ;;
  *)      echo "Unsupported OS: $OS"; exit 1 ;;
esac
case "$ARCH" in
  aarch64|arm64) TARGET="${TARGET/x64/arm64}" ;;
esac

# --- resolve version ---
if [ "$VERSION" = "latest" ]; then
  echo "Fetching latest release..."
  DOWNLOAD_URL=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
    | grep "browser_download_url.*$TARGET" \
    | cut -d '"' -f 4)
  VERSION_TAG=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
    | grep '"tag_name"' | cut -d '"' -f 4)
else
  DOWNLOAD_URL="https://github.com/$REPO/releases/download/$VERSION/$APP-$TARGET"
  VERSION_TAG="$VERSION"
fi

if [ -z "$DOWNLOAD_URL" ]; then
  echo "Error: could not find release asset for $TARGET"
  exit 1
fi

# --- download ---
echo "Downloading $APP $VERSION_TAG ($TARGET)..."
mkdir -p "$INSTALL_DIR"
TMP_FILE=$(mktemp)
curl -fsSL "$DOWNLOAD_URL" -o "$TMP_FILE"
chmod +x "$TMP_FILE"
mv "$TMP_FILE" "$INSTALL_DIR/$APP"

echo ""
echo "✅ $APP $VERSION_TAG installed to $INSTALL_DIR/$APP"
echo ""
echo "Add to PATH (bash/zsh):  export PATH=\"\$PATH:$INSTALL_DIR\""
echo "Add to PATH (fish):      fish_add_path $INSTALL_DIR"
echo ""
echo "Run:  $APP --version"
