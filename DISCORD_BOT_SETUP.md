# Discord Trading Bot Setup Guide

This guide will help you set up the Discord bot that integrates with your Bloomberg Terminal to provide real-time options flow analysis.

## 📋 Prerequisites

- Node.js 16.9.0 or higher installed
- Discord account
- Your Bloomberg Terminal running (locally or deployed)
- Polygon.io API key

## 🤖 Step 1: Create Discord Bot

1. **Go to Discord Developer Portal**
   - Visit: https://discord.com/developers/applications
   - Log in with your Discord account

2. **Create New Application**
   - Click "New Application" button
   - Name it (e.g., "Trading Bot" or "Options Flow Bot")
   - Click "Create"

3. **Create Bot User**
   - In the left sidebar, click "Bot"
   - Click "Add Bot" button
   - Confirm by clicking "Yes, do it!"

4. **Configure Bot Settings**
   - Under "Privileged Gateway Intents", enable:
     - ✅ MESSAGE CONTENT INTENT (required!)
     - ✅ SERVER MEMBERS INTENT
   - Click "Save Changes"

5. **Get Bot Token**
   - Under "TOKEN" section, click "Reset Token"
   - Click "Yes, do it!"
   - **Copy the token** (you'll need this later)
   - ⚠️ **NEVER share this token publicly!**

6. **Invite Bot to Your Server**
   - Go to "OAuth2" → "URL Generator" in left sidebar
   - Under "SCOPES", check:
     - ✅ bot
   - Under "BOT PERMISSIONS", check:
     - ✅ Send Messages
     - ✅ Send Messages in Threads
     - ✅ Embed Links
     - ✅ Attach Files
     - ✅ Read Message History
     - ✅ Add Reactions
   - Copy the generated URL at the bottom
   - Paste URL in browser and select your server
   - Click "Authorize"

## 📦 Step 2: Install Bot Dependencies

Open terminal in your project directory and run:

```powershell
# Create a separate package.json for the bot
Copy-Item package-discord.json package-bot.json

# Install dependencies
npm install --prefix discord-bot discord.js@14.14.1 node-fetch@2.7.0 dotenv@16.3.1
```

Or manually install:

```powershell
mkdir discord-bot
cd discord-bot
npm init -y
npm install discord.js node-fetch dotenv
```

Then move the `discord-bot.js` file into the `discord-bot` folder.

## ⚙️ Step 3: Configure Environment Variables

1. **Copy the environment template:**

```powershell
Copy-Item .env.discord .env.local
```

2. **Edit `.env.local` with your values:**

```env
# Your Discord bot token from Step 1
DISCORD_BOT_TOKEN=YOUR_BOT_TOKEN_HERE

# Command prefix (! is default)
BOT_PREFIX=!

# Your Bloomberg Terminal URL
# For local development:
BASE_URL=http://localhost:3000
# For production (replace with your domain):
# BASE_URL=https://your-terminal-domain.com

# Your Polygon.io API key
POLYGON_API_KEY=kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf
```

## 🚀 Step 4: Start Your Terminal

Your Bloomberg Terminal must be running for the bot to fetch data.

**For local development:**
```powershell
npm run dev
```

**For production:**
Make sure your terminal is deployed and accessible at the URL you set in `BASE_URL`.

## 🤖 Step 5: Start the Discord Bot

In a **new terminal window** (keep your Next.js terminal running):

```powershell
# Navigate to your project directory
cd c:\Users\Zak\Downloads\Highlights\bloomberg-terminal

# Load environment variables and start bot
$env:DISCORD_BOT_TOKEN="your_token_here"; node discord-bot.js
```

Or create a start script:

```powershell
# Create start-bot.ps1
@"
# Load environment variables
Get-Content .env.local | ForEach-Object {
    if (`$_ -match '^([^=]+)=(.*)$') {
        Set-Item -Path "env:`$(`$matches[1])" -Value `$matches[2]
    }
}

# Start bot
node discord-bot.js
"@ | Out-File -FilePath start-bot.ps1

# Run it
.\start-bot.ps1
```

You should see:
```
✅ Logged in as YourBot#1234
📊 Serving 1 servers
🔗 Base URL: http://localhost:3000
```

## 📱 Step 6: Use Bot Commands

In your Discord server, try these commands:

### Basic Commands

**Get help:**
```
!help
```

**Options flow for a ticker:**
```
!flow AMD
!flow NVDA
!flow TSLA
```

**EFI Highlights (filtered trades):**
```
!efi AMD
!efi AAPL
```

**Best flow (A+ to A- grade):**
```
!best NVDA
!best TSLA
```

### Scan Categories

**Magnificent 7 stocks:**
```
!flow MAG7
!efi MAG7
```

**Major ETFs:**
```
!flow ETF
!efi ETF
```

**All tickers:**
```
!flow ALL
!best ALL
```

## 🎯 Command Reference

| Command | Description | Example |
|---------|-------------|---------|
| `!help` | Show all available commands | `!help` |
| `!flow <TICKER>` | Get options flow for ticker | `!flow AMD` |
| `!efi <TICKER>` | Get EFI highlight trades | `!efi NVDA` |
| `!best <TICKER>` | Get A grade trades only | `!best TSLA` |

### Supported Tickers

- **Any stock ticker**: AMD, NVDA, AAPL, TSLA, etc.
- **MAG7**: AAPL, NVDA, MSFT, TSLA, AMZN, META, GOOGL, GOOG
- **ETF**: SPY, QQQ, DIA, IWM, XLK, SMH, and more
- **ALL**: All tickers (excluding ETFs and MAG7)

## 🛠️ Troubleshooting

### Bot doesn't respond
- ✅ Check bot is online in Discord (green status)
- ✅ Verify MESSAGE CONTENT INTENT is enabled
- ✅ Check bot has permission to read/send messages in the channel
- ✅ Verify you're using correct prefix (default: `!`)

### "No data found" errors
- ✅ Ensure Bloomberg Terminal is running
- ✅ Check BASE_URL is correct in `.env.local`
- ✅ Verify Polygon API key is valid
- ✅ Check terminal logs for API errors

### Bot crashes
- ✅ Check Node.js version (16.9.0+)
- ✅ Verify all dependencies installed
- ✅ Check environment variables are set
- ✅ Review bot console for error messages

### Rate limiting
- Discord has rate limits (5 commands per 5 seconds per user)
- Terminal API may rate limit requests
- Solution: Wait a few seconds between commands

## 🌐 Production Deployment

### Option 1: Run on Same Server as Terminal

1. Use process manager like PM2:
```bash
npm install -g pm2
pm2 start discord-bot.js --name "trading-bot"
pm2 save
pm2 startup
```

### Option 2: Deploy to Separate Server

1. Deploy bot to:
   - Heroku
   - Railway.app
   - DigitalOcean
   - AWS EC2
   - Google Cloud Run

2. Set environment variables on platform
3. Ensure BASE_URL points to your deployed terminal

### Option 3: Docker Container

Create `Dockerfile`:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY discord-bot.js .
COPY package-discord.json package.json
RUN npm install
CMD ["node", "discord-bot.js"]
```

Build and run:
```bash
docker build -t trading-bot .
docker run -d --env-file .env.local trading-bot
```

## 🔒 Security Best Practices

1. **Never commit `.env.local` to git**
   ```bash
   echo ".env.local" >> .gitignore
   ```

2. **Use environment variables** for all sensitive data

3. **Rotate tokens** periodically

4. **Limit bot permissions** to only what's needed

5. **Monitor bot usage** and set up alerts

## 📊 Monitoring

Add logging to track bot usage:

```javascript
// Add to discord-bot.js
client.on('messageCreate', async (message) => {
  console.log(`[${new Date().toISOString()}] ${message.author.tag}: ${message.content}`);
  // ... rest of code
});
```

## 🆘 Support

If you encounter issues:

1. Check bot console logs
2. Check terminal logs
3. Verify all environment variables
4. Test API endpoints manually
5. Review Discord Developer Portal for bot status

## 📈 Features

The bot includes:
- ✅ Real-time options flow data
- ✅ EFI criteria filtering
- ✅ Grade scoring (A+ to F)
- ✅ Multiple scan categories (MAG7, ETF, ALL)
- ✅ Rich Discord embeds with formatting
- ✅ Volume/Open Interest data
- ✅ Fill style analysis (AA, A, BB, B)
- ✅ Trade type indicators (SWEEP, BLOCK)
- ✅ Current price tracking
- ✅ Position performance metrics

Enjoy your Discord trading bot! 🚀📊
