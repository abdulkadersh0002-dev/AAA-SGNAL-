#!/usr/bin/env bash
# ============================================================
#  Clone AAA-SGNAL- and open it in VS Code
#  Usage:  bash clone-and-open.sh
# ============================================================

set -e

REPO_URL="https://github.com/abdulkadersh0002-dev/AAA-SGNAL-.git"
FOLDER_NAME="AAA-SGNAL-"

echo ""
echo "============================================================"
echo " Cloning $REPO_URL"
echo "============================================================"
git clone "$REPO_URL"

echo ""
echo "============================================================"
echo " Opening folder in VS Code ..."
echo "============================================================"
if command -v code &>/dev/null; then
    if code "$FOLDER_NAME"; then
        echo ""
        echo "Done! VS Code should now be open with all project files."
    else
        echo ""
        echo "WARNING: VS Code exited with an error opening the folder."
        echo "You can try opening it manually: File > Open Folder > $(pwd)/$FOLDER_NAME"
    fi
else
    echo ""
    echo "WARNING: 'code' command not found."
    echo "Make sure VS Code is installed and the 'code' CLI is on PATH."
    echo "  Mac:   run 'Shell Command: Install code command in PATH' from VS Code (Cmd+Shift+P)"
    echo "  Linux: ensure the VS Code snap/deb package installed the 'code' symlink"
    echo ""
    echo "You can also open VS Code manually and choose:"
    echo "  File > Open Folder > $(pwd)/$FOLDER_NAME"
fi
