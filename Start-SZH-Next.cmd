@echo off
setlocal
rem SZH new desktop client (Electron + React) on top of the local Harness.
rem Fallback clients stay untouched: Start-SZH.cmd (web preview) and Open-SZH-Desktop.cmd (WinForms).
rem Usage: Start-SZH-Next.cmd [rebuild] [mock]
cd /d "%~dp0"
where npm.cmd >nul 2>&1
if errorlevel 1 (
    echo Install Node.js 22.19+ and reopen this file.
    pause
    exit /b 1
)
if not exist "node_modules\ajv\package.json" (
    call npm.cmd ci --no-audit --no-fund
    if errorlevel 1 goto failed
)
set "APP=%~dp0apps\szh-app"
if not exist "%APP%\node_modules\electron\dist\electron.exe" (
    pushd "%APP%"
    call npm.cmd ci --no-audit --no-fund || (popd & goto failed)
    popd
)

if "%SZH_PORT%"=="" set "SZH_PORT=4782"
set "SZH_HARNESS_URL=http://127.0.0.1:%SZH_PORT%"
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 '%SZH_HARNESS_URL%/api/health' | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
    echo Starting Harness on %SZH_HARNESS_URL% ...
    start "SZH Harness" /min cmd /c "npm.cmd start"
) else (
    echo Harness already running on %SZH_HARNESS_URL%.
)

set "NEED_BUILD="
if /i "%~1"=="rebuild" set "NEED_BUILD=1"
if not exist "%APP%\dist\index.html" set "NEED_BUILD=1"
if not exist "%APP%\dist-electron\main.js" set "NEED_BUILD=1"
if defined NEED_BUILD (
    pushd "%APP%"
    call npm.cmd run build || (popd & goto failed)
    popd
)

set "SZH_DATA="
if /i "%~1"=="mock" set "SZH_DATA=mock"
if /i "%~2"=="mock" set "SZH_DATA=mock"
start "" /d "%APP%" "%APP%\node_modules\electron\dist\electron.exe" .
exit /b 0

:failed
echo Startup failed. The previous clients are still available: Start-SZH.cmd / Open-SZH-Desktop.cmd
pause
exit /b 1
