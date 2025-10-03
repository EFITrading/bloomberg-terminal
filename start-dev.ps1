#!/usr/bin/env pwsh
# Bloomberg Terminal Dev Server Launcher
# This ensures we're always in the right directory

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

Write-Host "Starting Bloomberg Terminal Development Server..." -ForegroundColor Green
Write-Host "Project Directory: $ProjectRoot" -ForegroundColor Yellow

npm run dev