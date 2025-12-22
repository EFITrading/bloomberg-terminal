/**
 * Discord Trading Bot
 * Integrates with the Bloomberg Terminal's trading assistant to provide
 * options flow analysis and other trading data via Discord commands
 */

const { Client, GatewayIntentBits, EmbedBuilder, ActivityType, AttachmentBuilder } = require('discord.js');
const fetch = require('node-fetch');
const { createCanvas } = require('canvas');

// Configuration - Load from environment variables
const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;
const BOT_PREFIX = process.env.BOT_PREFIX || '!';
const BASE_URL = process.env.BASE_URL || 'https://www.efitrading.com';
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

// Helper function to convert HTML to Discord markdown
function htmlToDiscordMarkdown(html) {
  let text = html;
  
  // Convert <strong> to **bold**
  text = text.replace(/<strong>(.*?)<\/strong>/gi, '**$1**');
  
  // Convert <em> or <i> to *italic*
  text = text.replace(/<(?:em|i)>(.*?)<\/(?:em|i)>/gi, '*$1*');
  
  // Remove colored span tags but keep the content
  text = text.replace(/<span[^>]*style="[^"]*color:[^"]*"[^>]*>(.*?)<\/span>/gi, '$1');
  
  // Remove any remaining span tags
  text = text.replace(/<\/?span[^>]*>/gi, '');
  
  // Remove div tags
  text = text.replace(/<\/?div[^>]*>/gi, '');
  
  // Convert <br> to newlines
  text = text.replace(/<br\s*\/?>/gi, '\n');
  
  // Remove any remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');
  
  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  
  return text;
}

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// EFI Criteria - EXACT match to terminal OptionsFlowTable.tsx
function meetsEfiCriteria(trade) {
  // 1. Check expiration (0-35 trading days)
  if (trade.days_to_expiry < 0 || trade.days_to_expiry > 35) {
    return false;
  }

  // 2. Check premium ($100k - $450k)
  if (trade.total_premium < 100000 || trade.total_premium > 450000) {
    return false;
  }

  // 3. Check contracts (650 - 1999)
  if (trade.trade_size < 650 || trade.trade_size > 1999) {
    return false;
  }

  // 4. Check OTM status
  if (!trade.moneyness || trade.moneyness !== 'OTM') {
    return false;
  }
  
  return true;
}

// NO GRADING CALCULATION - Use the positioning data that comes FROM THE API

// Fetch options flow data
async function getOptionsFlow(ticker, efiOnly = false, gradeFilter = null) {
  try {
    // For EFI queries, use the new API endpoint that calculates positioning with real-time data
    if (efiOnly) {
      const url = `${BASE_URL}/api/efi-with-positioning?ticker=${ticker.toUpperCase()}`;
      console.log(`🔍 Fetching EFI with positioning from: ${url}`);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.trades || data.trades.length === 0) {
        return { error: `No EFI Highlights found for ${ticker}` };
      }
      
      let displayTrades = data.trades;
      
      // Filter by grade if requested
      if (gradeFilter) {
        displayTrades = data.trades.filter(trade => {
          if (!trade.positioning) return false;
          
          if (gradeFilter === 'A') {
            return ['A+', 'A', 'A-'].includes(trade.positioning.grade);
          }
          
          return trade.positioning.grade === gradeFilter;
        });
        
        if (displayTrades.length === 0) {
          return { error: `No ${gradeFilter} grade flows found for ${ticker}` };
        }
      }
      
      console.log(`✅ Received ${displayTrades.length} EFI trades with positioning for ${ticker}`);
      return { trades: displayTrades, ticker: ticker.toUpperCase() };
    }
    
    // For non-EFI queries, use the streaming endpoint
    // Map scan categories
    let tickerParam = ticker.toUpperCase();
    if (tickerParam === 'MAG7') {
      tickerParam = 'AAPL,NVDA,MSFT,TSLA,AMZN,META,GOOGL,GOOG';
    } else if (tickerParam === 'ETF') {
      tickerParam = 'SPY,QQQ,DIA,IWM,XLK,SMH,XLE,XLF,XLV,XLI,XLP,XLU,XLY,XLB,XLRE,XLC,GLD,SLV,TLT,HYG,LQD,EEM,EFA,VXX,UVXY';
    } else if (tickerParam === 'ALL') {
      tickerParam = 'ALL_EXCLUDE_ETF_MAG7';
    }
    
    const url = `${BASE_URL}/api/stream-options-flow?ticker=${tickerParam}`;
    console.log(`🔍 Fetching from: ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    // Wait for the full response (simplified approach)
    const text = await response.text();
    const lines = text.split('\n');
    let allTrades = [];
    
    // Parse all data lines
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'complete' && data.trades) {
            allTrades = data.trades;
            console.log(`✅ Received ${allTrades.length} trades for ${ticker}`);
            break;
          } else if (data.type === 'progress') {
            console.log(`📊 ${data.message}`);
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
    
    if (allTrades.length === 0) {
      return { error: `No options flow data found for ${ticker}` };
    }
    
    return { trades: allTrades, ticker: ticker.toUpperCase() };
    
  } catch (error) {
    console.error('Error fetching options flow:', error);
    return { error: `Error fetching options flow: ${error.message}` };
  }
}

// Generate flow image using Canvas - matching exact terminal design
async function generateFlowImage(data, efiOnly = false) {
  const { trades, ticker } = data;
  const displayTrades = trades;
  
  // Higher resolution for sharper image
  const scale = 2;
  const width = 1350 * scale;
  const rowHeight = 39 * scale;
  const headerHeight = 50 * scale;
  const columnHeaderHeight = 35 * scale;
  const height = headerHeight + columnHeaderHeight + (displayTrades.length * rowHeight) + (20 * scale);
  
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  // Scale for high DPI
  ctx.scale(scale, scale);
  
  const baseWidth = 1350;
  const baseRowHeight = 39;
  const baseHeaderHeight = 50;
  const baseColumnHeaderHeight = 35;
  
  // Background - pure black
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, baseWidth, baseHeaderHeight + baseColumnHeaderHeight + (displayTrades.length * baseRowHeight) + 20);
  
  // Main Header
  ctx.fillStyle = '#ff8500';
  ctx.font = 'bold 28px Arial';
  ctx.fillText(`${ticker} EFI Highlights`, 15, 35);
  
  ctx.fillStyle = '#ffffff';
  ctx.font = '14px Arial';
  ctx.fillText(`Total Trades: ${trades.length}`, 15, baseHeaderHeight + 12);
  
  // Column Headers
  const colY = baseHeaderHeight + 28;
  ctx.fillStyle = '#ff8500';
  ctx.font = 'bold 11px Arial';
  
  ctx.fillText('TIME', 15, colY);
  ctx.fillText('SYMBOL', 80, colY);
  ctx.fillText('CALL/PUT', 160, colY);
  ctx.fillText('STRIKE', 210, colY);
  ctx.fillText('SIZE', 300, colY);
  ctx.fillText('PREMIUM', 440, colY);
  ctx.fillText('EXPIRATION', 550, colY);
  ctx.fillText('SPOT>>CURRENT', 670, colY);
  ctx.fillText('VOL/OI', 840, colY);
  ctx.fillText('TYPE', 980, colY);
  if (efiOnly) {
    ctx.fillText('POSITION', 1080, colY);
  }
  
  // Divider line under headers
  ctx.strokeStyle = '#ff8500';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(10, baseHeaderHeight + baseColumnHeaderHeight);
  ctx.lineTo(baseWidth - 10, baseHeaderHeight + baseColumnHeaderHeight);
  ctx.stroke();
  
  // Table rows
  let y = baseHeaderHeight + baseColumnHeaderHeight + 15;
  let rowIndex = 0;
  
  for (const trade of displayTrades) {
    const time = new Date(trade.trade_timestamp).toLocaleTimeString('en-US', { 
      hour: '2-digit', minute: '2-digit', hour12: false 
    });
    
    const isCall = trade.type.toLowerCase() === 'call';
    const cpColor = isCall ? '#22c55e' : '#ef4444';
    const cpText = isCall ? 'Call' : 'Put';
    
    // 3D row background - alternating subtle colors
    const rowY = baseHeaderHeight + baseColumnHeaderHeight + (rowIndex * baseRowHeight);
    ctx.fillStyle = rowIndex % 2 === 0 ? '#0a0a0a' : '#050505';
    ctx.fillRect(10, rowY, baseWidth - 20, baseRowHeight);
    
    // Row border for 3D effect
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    ctx.strokeRect(10, rowY, baseWidth - 20, baseRowHeight);
    
    // Column separators
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    const separatorX = [70, 150, 200, 290, 430, 540, 660, 830, 970, 1070];
    for (const x of separatorX) {
      ctx.beginPath();
      ctx.moveTo(x, rowY);
      ctx.lineTo(x, rowY + baseRowHeight);
      ctx.stroke();
    }
    
    // Time
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px Arial';
    ctx.fillText(time, 15, y);
    
    // Symbol
    ctx.fillStyle = '#ff8500';
    ctx.font = 'bold 16px Arial';
    ctx.fillText(trade.underlying_ticker, 80, y);
    
    // Call/Put
    ctx.fillStyle = cpColor;
    ctx.font = 'bold 14px Arial';
    ctx.fillText(cpText, 160, y);
    
    // Strike
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px Arial';
    ctx.fillText(`$${trade.strike.toFixed(2)}`, 210, y);
    
    // Size - contracts and premium together
    ctx.fillStyle = '#06b6d4';
    ctx.font = '14px Arial';
    const sizeText = trade.trade_size.toLocaleString();
    ctx.fillText(sizeText, 300, y);
    
    // Price per contract - right after size
    const sizeWidth = ctx.measureText(sizeText).width;
    ctx.fillStyle = '#eab308';
    ctx.fillText(`  @$${trade.premium_per_contract.toFixed(2)}`, 300 + sizeWidth, y);
    
    // Premium total
    ctx.fillStyle = '#22c55e';
    ctx.font = 'bold 15px Arial';
    ctx.fillText(`$${(trade.total_premium / 1000).toFixed(1)}K`, 440, y);
    
    // Expiration - use 'expiry' field from API
    let expiry = 'Invalid Date';
    try {
      if (trade.expiry) {
        // Handle date string format (YYYY-MM-DD)
        const expiryDate = new Date(trade.expiry + 'T00:00:00');
        if (!isNaN(expiryDate.getTime())) {
          expiry = `${String(expiryDate.getMonth() + 1).padStart(2, '0')}/${String(expiryDate.getDate()).padStart(2, '0')}/${expiryDate.getFullYear()}`;
        }
      }
    } catch (e) {
      console.error('Date parse error:', e, 'trade.expiry:', trade.expiry);
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = '13px Arial';
    ctx.fillText(expiry, 550, y);
    
    // Spot >> Current
    const spotPrice = trade.spot_price || 0;
    const currentStockPrice = trade.current_stock_price || spotPrice;
    ctx.fillStyle = '#ffffff';
    ctx.font = '13px Arial';
    const spotText = `$${spotPrice.toFixed(2)}>>>`;
    ctx.fillText(spotText, 670, y);
    
    const priceChangeColor = currentStockPrice >= spotPrice ? '#22c55e' : '#ef4444';
    ctx.fillStyle = priceChangeColor;
    const spotWidth = ctx.measureText(spotText).width;
    ctx.fillText(`$${currentStockPrice.toFixed(2)}`, 670 + spotWidth, y);
    
    // VOL/OI - no spaces
    if (trade.volume && trade.open_interest) {
      ctx.fillStyle = '#06b6d4';
      ctx.font = '14px Arial';
      const volText = trade.volume.toLocaleString();
      ctx.fillText(volText, 840, y);
      const volWidth = ctx.measureText(volText).width;
      ctx.fillStyle = '#a855f7';
      ctx.fillText(`/${trade.open_interest.toLocaleString()}`, 840 + volWidth, y);
    }
    
    // Trade type
    const typeColor = trade.trade_type === 'SWEEP' ? '#eab308' : '#3b82f6';
    ctx.fillStyle = typeColor;
    ctx.font = 'bold 13px Arial';
    ctx.fillText(trade.trade_type, 980, y);
    
    // Position/Grade (if EFI)
    if (efiOnly && trade.positioning) {
      const { grade, color } = trade.positioning;
      
      // Calculate P&L - use trade_price (actual entry price) and current_option_price from API
      const entryPrice = trade.trade_price || trade.premium_per_contract || 0;
      const currentOptPrice = trade.current_option_price || trade.current_price || entryPrice;
      const contractSize = trade.trade_size || 0;
      
      let percentChange = 0;
      let dollarPL = 0;
      if (entryPrice > 0 && currentOptPrice > 0) {
        percentChange = ((currentOptPrice - entryPrice) / entryPrice) * 100;
        dollarPL = (currentOptPrice - entryPrice) * contractSize * 100; // Each contract = 100 shares
      }
      
      const plColor = percentChange >= 0 ? '#22c55e' : '#ef4444';
      
      let xPos = 1080;
      
      // Dollar P&L first
      ctx.fillStyle = plColor;
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'left';
      const dollarText = dollarPL >= 0 
        ? `+$${(Math.abs(dollarPL) / 1000).toFixed(1)}K` 
        : `-$${(Math.abs(dollarPL) / 1000).toFixed(1)}K`;
      ctx.fillText(dollarText, xPos, y);
      xPos += ctx.measureText(dollarText).width + 10;
      
      // Percentage second
      const percentText = `${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(1)}%`;
      ctx.fillText(percentText, xPos, y);
      xPos += ctx.measureText(percentText).width + 15;
      
      // Grade letter last - slightly bigger (16px)
      ctx.fillStyle = color;
      ctx.font = 'bold 16px Arial';
      ctx.fillText(grade, xPos, y);
    }
    
    y += baseRowHeight;
    rowIndex++;
  }
  
  return canvas.toBuffer('image/png');
}

// Format trade data into Discord embed
function formatTradesEmbed(data, title, efiOnly = false) {
  const { trades, ticker } = data;
  
  const embed = new EmbedBuilder()
    .setColor('#ff8500')
    .setTitle(`📊 ${ticker} ${title}`)
    .setTimestamp()
    .setFooter({ text: `Total Trades: ${trades.length} | EFI Trading Terminal` });
  
  if (trades.length > 10) {
    embed.setDescription(`⚠️ Showing top 10 of **${trades.length}** trades. Use the web terminal for full details.`);
  }
  
  // Show up to 10 trades (Discord limit on fields is 25)
  const displayTrades = trades.slice(0, 10);
  
  for (const trade of displayTrades) {
    const time = new Date(trade.trade_timestamp).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
    
    const isCall = trade.type.toLowerCase() === 'call';
    const cpEmoji = isCall ? '🟢' : '🔴';
    const cpText = isCall ? 'CALL' : 'PUT';
    
    const premium = (trade.total_premium / 1000).toFixed(1);
    const size = trade.trade_size.toLocaleString();
    const price = trade.premium_per_contract.toFixed(2);
    const strike = trade.strike.toFixed(2);
    
    // Format expiration date
    let expiry = 'Invalid Date';
    try {
      const expiryDate = new Date(trade.expiration_date);
      if (!isNaN(expiryDate.getTime())) {
        expiry = expiryDate.toLocaleDateString('en-US', { 
          month: '2-digit',
          day: '2-digit',
          year: '2-digit'
        });
      }
    } catch (e) {
      expiry = String(trade.expiration_date).substring(0, 10);
    }
    
    const fillStyle = trade.fill_style || 'N/A';
    const typeEmoji = trade.trade_type === 'SWEEP' ? '⚡' : trade.trade_type === 'BLOCK' ? '🧱' : '📊';
    
    // Build field value with better formatting
    let fieldValue = '';
    
    // Line 1: Type and basic info
    fieldValue += `${cpEmoji} **${cpText}** | \`$${strike}\` Strike | \`${expiry}\`\n`;
    
    // Line 2: Trade details
    fieldValue += `${typeEmoji} **${trade.trade_type}** | \`${size}\` @ \`$${price}\``;
    if (fillStyle !== 'N/A') {
      const fillEmoji = (fillStyle === 'AA' || fillStyle === 'A') ? '🟢' : '🔴';
      fieldValue += ` ${fillEmoji}\`[${fillStyle}]\``;
    }
    fieldValue += '\n';
    
    // Line 3: Premium
    fieldValue += `💰 **$${premium}K Premium**\n`;
    
    // Line 4: Volume/OI
    if (trade.volume && trade.open_interest) {
      fieldValue += `📊 VOL: \`${trade.volume.toLocaleString()}\` | OI: \`${trade.open_interest.toLocaleString()}\`\n`;
    }
    
    // Line 5: Grade and P/L (for EFI only)
    if (efiOnly && trade.positioning) {
      const { grade, score } = trade.positioning;
      const entryPrice = trade.premium_per_contract;
      const currentPrice = trade.current_price || entryPrice;
      const percentChange = entryPrice > 0 ? (((currentPrice - entryPrice) / entryPrice) * 100).toFixed(2) : '0.00';
      const percentNum = parseFloat(percentChange);
      const percentEmoji = percentNum > 0 ? '📈' : percentNum < 0 ? '📉' : '➡️';
      const percentColor = percentNum > 0 ? '+' : '';
      
      // Grade circle color
      let gradeEmoji = '🟢';
      if (grade.startsWith('C') || grade === 'D' || grade === 'F') {
        gradeEmoji = '🔴';
      } else if (grade.startsWith('B')) {
        gradeEmoji = '🟡';
      }
      
      fieldValue += `${gradeEmoji} **Grade ${grade}** (${score}) ${percentEmoji} \`${percentColor}${percentChange}%\``;
    }
    
    embed.addFields({
      name: `\`${time}\` **${trade.underlying_ticker}**`,
      value: fieldValue,
      inline: false
    });
  }
  
  return embed;
}

// Help command
function getHelpEmbed() {
  const embed = new EmbedBuilder()
    .setColor('#ff8500')
    .setTitle('🤖 Trading Bot Commands')
    .setDescription('Your AI-powered trading assistant with options flow and seasonal analysis')
    .addFields(
      {
        name: '⚡ EFI Command (Image)',
        value: `\`${BOT_PREFIX}efi <TICKER>\` - Generate EFI highlights image\nExample: \`${BOT_PREFIX}efi AMD\``,
        inline: false
      },
      {
        name: '📊 Weekly Range (Image)',
        value: `\`${BOT_PREFIX}<TICKER> weekly range\` - Expected weekly range\nExample: \`${BOT_PREFIX}SPY weekly range\``,
        inline: false
      },
      {
        name: '📈 Seasonal Chart Commands (Image)',
        value: `\`${BOT_PREFIX}seasonal <TICKER> [years]\` - Seasonal pattern chart\nExamples:\n• \`${BOT_PREFIX}seasonal SPY\` - 20Y seasonal\n• \`${BOT_PREFIX}seasonal AAPL 10y\` - 10Y seasonal\n\n**Election Modes:**\n• \`${BOT_PREFIX}postelection SPY\`\n• \`${BOT_PREFIX}electionyear SPY\`\n• \`${BOT_PREFIX}midterm SPY\`\n• \`${BOT_PREFIX}preelection SPY\``,
        inline: false
      },
      {
        name: '🤖 AI Trading Assistant',
        value: `Ask me anything about options flow and trading!\nExamples:\n• \`${BOT_PREFIX}AMD flow\` - Get options flow data\n• \`${BOT_PREFIX}AMD oi weekly\` - Weekly OI analysis\n• \`${BOT_PREFIX}AAPL best 30day\` - Best 30-day periods\n• \`${BOT_PREFIX}TSLA weekly range\` - Weekly price range`,
        inline: false
      },
      {
        name: '📈 Special Scans',
        value: `\`MAG7\`, \`ETF\`, \`ALL\` - Works with commands\nExample: \`${BOT_PREFIX}efi MAG7\``,
        inline: false
      }
    )
    .setFooter({ text: 'EFI Criteria: $100K-$450K premium, 650-1999 contracts, OTM, 0-35 DTE' })
    .setTimestamp();
  
  return embed;
}

// Bot ready event
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`📊 Serving ${client.guilds.cache.size} servers`);
  console.log(`🔗 Base URL: ${BASE_URL}`);
  
  // Set bot status
  client.user.setActivity('options flow', { type: ActivityType.Watching });
  client.user.setStatus('online');
});

// Message handler
client.on('messageCreate', async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;
  
  const content = message.content.trim();
  
  // Check if message starts with prefix
  if (!content.startsWith(BOT_PREFIX)) return;
  
  const fullCommand = content.slice(BOT_PREFIX.length).trim();
  const args = fullCommand.split(/\s+/);
  const command = args[0].toLowerCase();
  const ticker = args[1]?.toUpperCase();
  
  try {
    // Help command
    if (command === 'help' || command === 'h') {
      const helpEmbed = getHelpEmbed();
      await message.reply({ embeds: [helpEmbed] });
      return;
    }
    
    // Show typing indicator
    await message.channel.sendTyping();
    
    // EFI command - Generate image
    if (command === 'efi' || command === 'e') {
      // Check if ticker provided
      if (!ticker) {
        await message.reply(`❌ Please provide a ticker. Example: \`${BOT_PREFIX}efi AMD\``);
        return;
      }
      
      const data = await getOptionsFlow(ticker, true);
      
      if (data.error) {
        await message.reply(`❌ ${data.error}`);
        return;
      }
      
      const imageBuffer = await generateFlowImage(data, true);
      const attachment = new AttachmentBuilder(imageBuffer, { name: `${ticker}-efi.png` });
      
      const embed = new EmbedBuilder()
        .setColor('#ff8500')
        .setTitle(`📊 ${ticker} EFI Highlights`)
        .setDescription(`Found **${data.trades.length}** EFI highlight trades`)
        .setImage(`attachment://${ticker}-efi.png`)
        .setTimestamp()
        .setFooter({ text: 'EFI Trading Terminal' });
      
      await message.reply({ embeds: [embed], files: [attachment] });
      return;
    }
    
    // Seasonal chart commands
    if (command === 'seasonal' || command === 's') {
      if (!ticker) {
        await message.reply(`❌ Please provide a ticker. Example: \`${BOT_PREFIX}seasonal SPY\``);
        return;
      }
      
      // Extract years if provided (e.g., "seasonal SPY 20y")
      const yearsMatch = args[2]?.match(/(\d+)y?/i);
      const years = yearsMatch ? parseInt(yearsMatch[1]) : 20;
      
      try {
        const imageUrl = `${BASE_URL}/api/seasonal-chart-image?symbol=${ticker}&years=${years}`;
        const response = await fetch(imageUrl);
        
        if (!response.ok) {
          await message.reply(`❌ Unable to generate seasonal chart for ${ticker}`);
          return;
        }
        
        const imageBuffer = Buffer.from(await response.arrayBuffer());
        const attachment = new AttachmentBuilder(imageBuffer, { name: `${ticker}-seasonal.png` });
        
        const embed = new EmbedBuilder()
          .setColor('#ff8500')
          .setTitle(`📈 ${ticker} - ${years}Y Seasonal Pattern`)
          .setDescription('Detrended & Benchmarked')
          .setImage(`attachment://${ticker}-seasonal.png`)
          .setTimestamp()
          .setFooter({ text: 'EFI Trading Terminal' });
        
        await message.reply({ embeds: [embed], files: [attachment] });
        return;
      } catch (error) {
        console.error('Error fetching seasonal chart:', error);
        await message.reply(`❌ Error generating seasonal chart for ${ticker}`);
        return;
      }
    }
    
    // Weekly range command
    if ((command === 'weekly' && args[1]?.toLowerCase() === 'range') || command === 'range') {
      if (!ticker && command !== 'range') {
        await message.reply(`❌ Please provide a ticker. Example: \`${BOT_PREFIX}SPY weekly range\``);
        return;
      }
      
      const symbol = command === 'range' ? args[0]?.toUpperCase() : ticker;
      const customDate = args[2]; // Optional date
      
      if (!symbol) {
        await message.reply(`❌ Please provide a ticker. Example: \`${BOT_PREFIX}SPY weekly range\``);
        return;
      }
      
      try {
        let imageUrl = `${BASE_URL}/api/weekly-range-image?symbol=${symbol}`;
        if (customDate) {
          imageUrl += `&date=${customDate}`;
        }
        
        const response = await fetch(imageUrl);
        
        if (!response.ok) {
          await message.reply(`❌ Unable to generate weekly range for ${symbol}`);
          return;
        }
        
        const imageBuffer = Buffer.from(await response.arrayBuffer());
        const attachment = new AttachmentBuilder(imageBuffer, { name: `${symbol}-range.png` });
        
        const embed = new EmbedBuilder()
          .setColor('#ff8500')
          .setTitle(`📊 ${symbol} - Weekly Expected Range`)
          .setImage(`attachment://${symbol}-range.png`)
          .setTimestamp()
          .setFooter({ text: 'EFI Trading Terminal' });
        
        await message.reply({ embeds: [embed], files: [attachment] });
        return;
      } catch (error) {
        console.error('Error fetching weekly range:', error);
        await message.reply(`❌ Error generating weekly range for ${symbol}`);
        return;
      }
    }
    
    // Election mode seasonal charts
    const electionModes = {
      'postelection': 'Post-Election',
      'electionyear': 'Election Year',
      'midterm': 'Mid-Term',
      'preelection': 'Pre-Election'
    };
    
    const normalizedCommand = command.replace(/[-_]/g, '').toLowerCase();
    if (electionModes[normalizedCommand]) {
      if (!ticker) {
        await message.reply(`❌ Please provide a ticker. Example: \`${BOT_PREFIX}${command} SPY\``);
        return;
      }
      
      try {
        const electionMode = electionModes[normalizedCommand];
        const imageUrl = `${BASE_URL}/api/seasonal-chart-image?symbol=${ticker}&years=20&electionMode=${encodeURIComponent(electionMode)}`;
        const response = await fetch(imageUrl);
        
        if (!response.ok) {
          await message.reply(`❌ Unable to generate ${electionMode} seasonal chart for ${ticker}`);
          return;
        }
        
        const imageBuffer = Buffer.from(await response.arrayBuffer());
        const attachment = new AttachmentBuilder(imageBuffer, { name: `${ticker}-${command}.png` });
        
        const embed = new EmbedBuilder()
          .setColor('#ff8500')
          .setTitle(`📈 ${ticker} - ${electionMode} Seasonal Pattern`)
          .setImage(`attachment://${ticker}-${command}.png`)
          .setTimestamp()
          .setFooter({ text: 'EFI Trading Terminal' });
        
        await message.reply({ embeds: [embed], files: [attachment] });
        return;
      } catch (error) {
        console.error('Error fetching election seasonal chart:', error);
        await message.reply(`❌ Error generating seasonal chart for ${ticker}`);
        return;
      }
    }
    
    // All other commands - Forward to AI chatbot API
    const response = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: fullCommand }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();
    let aiResponse = data.content || 'No response from AI';
    
    // Check if response is seasonal chart JSON
    try {
      const parsed = JSON.parse(aiResponse);
      if (parsed.type === 'seasonal-chart' && parsed.data) {
        // Generate image from seasonal data
        const symbol = parsed.data.symbol;
        const years = parsed.data.yearsOfData || 20;
        const electionMode = parsed.data.electionMode;
        
        let imageUrl = `${BASE_URL}/api/seasonal-chart-image?symbol=${symbol}&years=${years}`;
        if (electionMode) {
          imageUrl += `&electionMode=${encodeURIComponent(electionMode)}`;
        }
        
        const imageResponse = await fetch(imageUrl);
        if (imageResponse.ok) {
          const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
          const attachment = new AttachmentBuilder(imageBuffer, { name: `${symbol}-seasonal.png` });
          
          const embed = new EmbedBuilder()
            .setColor('#ff8500')
            .setTitle(`📈 ${symbol} - ${years}Y Seasonal Pattern`)
            .setImage(`attachment://${symbol}-seasonal.png`)
            .setTimestamp()
            .setFooter({ text: 'EFI Trading Terminal' });
          
          await message.reply({ embeds: [embed], files: [attachment] });
          return;
        }
      }
    } catch (e) {
      // Not seasonal chart JSON, continue with text response
    }
    
    // Convert HTML to Discord markdown
    aiResponse = htmlToDiscordMarkdown(aiResponse);
    
    // Discord has 2000 character limit, split if needed
    if (aiResponse.length <= 2000) {
      await message.reply(aiResponse);
    } else {
      // Split into chunks of 2000 characters
      const chunks = aiResponse.match(/[\s\S]{1,2000}/g) || [];
      for (const chunk of chunks) {
        await message.reply(chunk);
      }
    }
    
  } catch (error) {
    console.error('Error processing command:', error);
    await message.reply('❌ An error occurred while processing your request. Please try again later.');
  }
});

// Error handling
client.on('error', (error) => {
  console.error('Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

// Login to Discord
if (!DISCORD_TOKEN) {
  console.error('❌ DISCORD_BOT_TOKEN environment variable is not set!');
  process.exit(1);
}

client.login(DISCORD_TOKEN).catch((error) => {
  console.error('❌ Failed to login to Discord:', error);
  process.exit(1);
});
