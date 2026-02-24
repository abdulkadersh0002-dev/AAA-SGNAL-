@echo off
:: ============================================================
::  Clone AAA-SGNAL- and open it in VS Code
::  Double-click this file (or run it from a terminal)
:: ============================================================

set REPO_URL=https://github.com/abdulkadersh0002-dev/AAA-SGNAL-.git
set FOLDER_NAME=AAA-SGNAL-

echo.
echo ============================================================
echo  Cloning %REPO_URL%
echo ============================================================
git clone %REPO_URL%
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: git clone failed.
    echo Make sure Git is installed: https://git-scm.com/download/win
    pause
    exit /b 1
)

echo.
echo ============================================================
echo  Opening folder in VS Code ...
echo ============================================================
code %FOLDER_NAME%
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo WARNING: "code" command not found.
    echo Make sure VS Code is installed and "Add to PATH" was selected
    echo during installation, then re-run this script.
    echo.
    echo You can also open VS Code manually and choose:
    echo   File ^> Open Folder ^> %CD%\%FOLDER_NAME%
    pause
    exit /b 1
)

echo.
echo Done! VS Code should now be open with all project files.
pause
