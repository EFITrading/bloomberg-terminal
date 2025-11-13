# Discord OAuth Setup Instructions

## Complete Discord Authentication Setup

I've implemented a complete Discord OAuth authentication system for your Bloomberg Terminal. Here's what's been created:

### 🔧 **Files Created/Modified:**

1. **Authentication API Route** (`src/app/api/auth/[...nextauth]/route.ts`)
   - Discord OAuth provider configuration
   - Role-based access control using Discord API v10
   - Guild member verification with required role checking

2. **TypeScript Declarations** (`next-auth.d.ts`)
   - Extended NextAuth types for Discord user data
   - Added `hasAccess` property to session/JWT

3. **Auth Guard Component** (`src/components/auth/AuthGuard.tsx`)
   - Client-side authentication protection
   - Automatic redirects for unauthorized users
   - Discord-styled login/logout UI components

4. **Middleware** (`middleware.ts`)
   - Route protection for entire application
   - Automatic redirects based on auth status
   - Security headers and CSP

5. **Auth Pages:**
   - Sign-in page (`src/app/auth/signin/page.tsx`)
   - No-access page (`src/app/auth/no-access/page.tsx`)

6. **Layout Updates** (`src/app/layout.tsx`)
   - Added SessionProvider wrapper for NextAuth

### 🚀 **Setup Steps:**

#### 1. **Environment Variables** (REQUIRED)
Create `.env.local` file with these variables:

```bash
# Discord OAuth (get from https://discord.com/developers/applications)
DISCORD_CLIENT_ID=your_discord_client_id_here
DISCORD_CLIENT_SECRET=your_discord_client_secret_here
DISCORD_BOT_TOKEN=your_discord_bot_token_here

# Your Discord server and role IDs
DISCORD_GUILD_ID=your_discord_guild_id_here
DISCORD_REQUIRED_ROLE_ID=your_required_role_id_here

# NextAuth configuration
NEXTAUTH_SECRET=your_nextauth_secret_here
NEXTAUTH_URL=http://localhost:3000
```

#### 2. **Discord Application Setup:**

**A. Create Discord Application:**
1. Go to https://discord.com/developers/applications
2. Click "New Application"
3. Name it (e.g., "Bloomberg Terminal")

**B. OAuth2 Configuration:**
1. Go to OAuth2 > General
2. Copy `Client ID` and `Client Secret`
3. Add Redirect URI: `http://localhost:3000/api/auth/callback/discord`

**C. Bot Configuration:**
1. Go to Bot section
2. Create bot if needed
3. Copy `Bot Token`
4. Enable these intents:
   - Server Members Intent
   - Message Content Intent (if needed)

#### 3. **Get Discord IDs:**

**Guild ID:**
1. Enable Developer Mode in Discord (User Settings > Advanced)
2. Right-click your server name → Copy ID

**Role ID:**
1. In your server, go to Server Settings → Roles
2. Right-click the required role → Copy ID

#### 4. **Generate NextAuth Secret:**
```bash
# Run this command to generate a secure secret:
openssl rand -base64 32

# Or use any secure random string generator
```

### 🔒 **How It Works:**

1. **Authentication Flow:**
   - Users visit any protected route
   - Middleware redirects to `/auth/signin`
   - User clicks "Sign in with Discord"
   - Discord OAuth flow completes
   - System checks if user has required Discord role
   - Access granted/denied based on role verification

2. **Role Verification:**
   - Uses Discord Bot API to check guild membership
   - Verifies user has the required role ID
   - Stores access status in JWT token
   - Middleware enforces access on all routes

3. **Security Features:**
   - JWT tokens with role information
   - Automatic token refresh
   - Route-level protection
   - CSP and security headers
   - No client-side role bypass possible

### 🎯 **User Experience:**

- **Authorized Users:** Seamless access to all terminal features
- **Unauthorized Users:** Clean error page with support contact
- **Non-Members:** Redirect to Discord sign-in with clear requirements

### 📋 **Next Steps:**

1. ✅ Fill in your Discord application credentials in `.env.local`
2. ✅ Test the authentication flow
3. ✅ Verify role checking works correctly
4. ✅ Deploy with production Discord redirect URLs

The system is now ready - just add your Discord credentials to `.env.local` and test it out!