# Discord Bot Startup Script
# Make sure your Bloomberg Terminal is running first (npm run dev)

Write-Host "🤖 Starting Discord Trading Bot..." -ForegroundColor Cyan
Write-Host ""

# Load environment variables from .env.local
if (Test-Path ".env.local") {
    Write-Host "📋 Loading environment variables..." -ForegroundColor Yellow
    Get-Content .env.local | ForEach-Object {
        if ($_ -match '^([^=]+)=(.*)$') {
            $key = $matches[1]
            $value = $matches[2]
            [Environment]::SetEnvironmentVariable($key, $value, "Process")
            Write-Host "  ✓ $key" -ForegroundColor Green
        }
    }
    Write-Host ""
} else {
    Write-Host "❌ .env.local file not found!" -ForegroundColor Red
    exit 1
}

# Check if discord-bot.js exists
if (-not (Test-Path "discord-bot.js")) {
    Write-Host "❌ discord-bot.js not found!" -ForegroundColor Red
    exit 1
}

# Check if node_modules exists
if (-not (Test-Path "node_modules\discord.js")) {
    Write-Host "⚠️  Discord.js not installed. Installing dependencies..." -ForegroundColor Yellow
    npm install discord.js@14.14.1 node-fetch@2.7.0 dotenv@16.3.1
    Write-Host ""
}

# Start the bot
Write-Host "🚀 Launching bot..." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop the bot" -ForegroundColor Gray
Write-Host ""
Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

node discord-bot.js
