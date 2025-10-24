#!/bin/bash

# Background Screener Deployment Script
# Run this to deploy the background screener system

echo "🚀 Deploying Background Screener System..."

# 1. Generate secure cron secret
CRON_SECRET=$(openssl rand -base64 32)
echo "Generated CRON_SECRET: $CRON_SECRET"

# 2. Deploy to Vercel
echo "📦 Deploying to Vercel..."
vercel --prod

# 3. Set environment variables in Vercel
echo "🔧 Setting environment variables..."
vercel env add CRON_SECRET <<< "$CRON_SECRET"
vercel env add NEXT_PUBLIC_BASE_URL <<< "https://bloomberg-terminal-eerb90zef-tts-projects-267a2b8f.vercel.app"

echo "✅ Deployment complete!"
echo ""
echo "🎯 Next steps:"
echo "1. Wait 10 minutes for first cron job run"
echo "2. Test at: https://your-domain.vercel.app/test-cache"
echo "3. Check Vercel logs for cron job execution"
echo "4. Update your screener pages to use cached data"
echo ""
echo "⚡ Your users will now experience instant loading!"