#!/usr/bin/env pwsh
# EFI Trading Dev Server Launcher
# This ensures we're always in the right directory

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

Write-Host "Starting EFI Trading Development Server..." -ForegroundColor Green
Write-Host "Project Directory: $ProjectRoot" -ForegroundColor Yellow

npm run dev