# Vercel Postgres Setup Guide

## Overview
This project uses Vercel Postgres (Prisma Postgres) for shared flow data storage accessible to all users.

## Local Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Link to Vercel Project
```bash
vercel link
```

### 3. Pull Environment Variables
```bash
vercel env pull .env
```
This will automatically download `POSTGRES_PRISMA_URL` and `POSTGRES_URL_NON_POOLING` from your Vercel project.

### 4. Generate Prisma Client
```bash
npx prisma generate
```

### 5. Push Database Schema
```bash
npx prisma db push
```

### 6. Run Development Server
```bash
npm run dev
```

## Vercel Deployment

### Important: Vercel handles Prisma automatically
- ✅ Vercel automatically runs `prisma generate` during build
- ✅ No postinstall scripts needed
- ✅ Environment variables are automatically available

### Environment Variables Setup

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Databases**
3. Click **Create Database** → **Postgres**
4. Select **Prisma Postgres** (256MB free tier)
5. Create a database named **"EFI Flows"**
6. Link it to your project

Vercel will automatically create these environment variables:
- `POSTGRES_PRISMA_URL` - Connection with pooling (for serverless)
- `POSTGRES_URL_NON_POOLING` - Direct connection (for migrations)

### Deploy
```bash
git push
```
Vercel will automatically deploy and handle Prisma generation.

## Database Schema

```prisma
model Flow {
  id        String   @id @default(cuid())
  date      String   @unique
  data      String   // JSON stringified flow data
  size      Int      // Size in bytes
  createdAt DateTime @default(now())
  
  @@index([date])
  @@index([createdAt])
}
```

## API Routes

- **POST** `/api/flows/save` - Save current flow data
- **GET** `/api/flows/dates` - Get all saved flow dates
- **GET** `/api/flows/[date]` - Load specific flow by date
- **DELETE** `/api/flows/[date]` - Delete flow by date

## Features

- **Save Flow**: Save current options flow data to database (auto-saves with today's date)
- **History**: View all saved flows with dates and sizes
- **Load Flow**: Load previously saved flow data
- **Auto-Cleanup**: Flows older than 5 days are automatically deleted when saving new data
- **Navy Blue 3D Glossy UI**: Beautiful dark navy blue modal design with 3D effects

## Troubleshooting

### Build fails with Prisma errors
- Make sure `POSTGRES_PRISMA_URL` and `POSTGRES_URL_NON_POOLING` are set in Vercel
- Check that the database is linked to your project
- Try redeploying after checking environment variables

### "Cannot connect to database"
- Verify environment variables are correct
- Run `vercel env pull .env` to refresh local env vars
- Check that the database is running in Vercel dashboard

### "Prisma Client not generated"
- Run `npx prisma generate` locally
- For Vercel deployment, it's handled automatically - no action needed

## Version Information

- **Prisma**: 5.22.0
- **@prisma/client**: 5.22.0
- **Next.js**: 15.5.9
- **Vercel Postgres**: Prisma Postgres (256MB free tier)

## Database Connection Details

The project uses Vercel's official pattern:
- Connection pooling via `POSTGRES_PRISMA_URL` for optimal serverless performance
- Direct connection via `POSTGRES_URL_NON_POOLING` for migrations
- Prisma singleton pattern to prevent connection pool exhaustion

## Notes

- Flows are stored as JSON strings in the database
- Each flow is uniquely identified by date (YYYY-MM-DD format)
- Maximum 5 days of history retained (auto-cleanup)
- Database is shared across all users of the application
