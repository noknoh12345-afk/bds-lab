@echo off
rem Windows: the same as setup.sh: Node.js 22 if missing (lab.cmd fetches it), what this machine lacks (doctor), then the
rem server and tools. Double-click, or run in a terminal. Safe to run again. Afterwards the lab works without network.
rem (A machine that does not have the lab yet: install.ps1 gets it and then does this, and proves it with selftest.)
cd /d "%~dp0"
chcp 65001 >nul
call lab.cmd doctor
call lab.cmd setup all
echo.
if "%~1"=="" pause
