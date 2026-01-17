# Vercel Postgres Setup Guide

## 🚀 Quick Setup Steps

### 1. Create Vercel Postgres Database

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Navigate to **Storage** tab
3. Click **Create Database**
4. Select **Postgres** (256MB free tier)
5. Name it (e.g., "bloomberg-terminal-db")
6. Select your region (closest to users)
7. Click **Create**

### 2. Get Database Connection Strings

1. Once created, click on your database
2. Go to **.env.local** tab
3. Copy all 4 database URLs shown
4. Create `.env.local` file in your project root
5. Paste the URLs into `.env.local`

Your `.env.local` should look like:
```env
DATABASE_URL="postgres://..."
POSTGRES_URL="postgres://..."
POSTGRES_PRISMA_URL="postgres://..."
POSTGRES_URL_NON_POOLING="postgres://..."
```

### 3. Push Database Schema

Run this command to create the Flow table:
```bash
npx prisma db push
```

This creates the Flow table in your database with:
- id (unique identifier)
- date (flow date)
- data (JSON flow data)
- size (data size in bytes)
- createdAt (timestamp)

### 4. Test Locally

```bash
npm run dev
```

Visit your Options Flow page and:
1. Click **SAVE** to save current flow
2. Click **HISTORY** to view saved flows
3. Click on a date card to load historical flow
4. Hover over cards to see **delete button**

### 5. Deploy to Vercel

```bash
git add .
git commit -m "Add Vercel Postgres flow storage"
git push
```

Vercel will:
1. Auto-detect the database
2. Link environment variables
3. Deploy with database access

## 📊 Features

✅ **Save Flow Data**: Click SAVE button to store current flow  
✅ **View History**: Click HISTORY to see all saved flows  
✅ **Load Historical**: Click any date card to view that flow  
✅ **Delete Flows**: Hover over cards, click X to delete  
✅ **Auto-Cleanup**: Flows older than 5 days are auto-deleted  
✅ **Shared Storage**: ALL users see the SAME saved flows  
✅ **Database Backed**: Reliable Postgres storage (not browser-based)  

## 💰 Pricing

- **Vercel Postgres Free Tier**: 256MB storage, 60 hours compute/month
- **Prisma**: 100% free (open-source ORM)
- **Estimated Storage**: ~500-1000 flow sessions in free tier

## 🔧 Troubleshooting

### Database Connection Error
- Verify `.env.local` has correct URLs
- Run `npx prisma db push` to create tables
- Restart dev server

### Prisma Client Error
- Run `npx prisma generate` to regenerate client
- Delete `node_modules/.prisma` and regenerate

### Flow Not Saving
- Check browser console for API errors
- Verify database is connected (Vercel dashboard)
- Check API routes are working: `/api/flows/dates`

## 📝 API Routes

- `POST /api/flows/save` - Save current flow
- `GET /api/flows/dates` - Get all saved flow dates
- `GET /api/flows/[date]` - Load specific flow
- `DELETE /api/flows/[date]` - Delete flow

## 🎯 Next Steps

1. Monitor database usage in Vercel dashboard
2. Adjust retention period (currently 5 days) in `/api/flows/save/route.ts`
3. Add user authentication to track who saved what (optional)
4. Enable analytics to see most-saved flow dates
