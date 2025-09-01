import cors from 'cors'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { RateLimiterRedis } from 'rate-limiter-flexible'

import { NextApiRequest, NextApiResponse } from 'next'

// Rate limiting configuration
export const createRateLimiter = () => {
  return rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // limit each IP to 100 requests per windowMs
    message: {
      error: 'Too many requests from this IP, please try again later.',
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  })
}

// Redis rate limiter (if Redis is available)
export const createRedisRateLimiter = () => {
  if (!process.env.REDIS_URL) {
    return null
  }

  return new RateLimiterRedis({
    storeClient: process.env.REDIS_URL,
    keyPrefix: 'bloomberg_terminal_rl',
    points: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    duration: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900'),
  })
}

// Security headers configuration
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-eval'", "'unsafe-inline'", 'https:'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'", 'https:'],
      connectSrc: ["'self'", 'https:', 'wss:'],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Required for some financial data APIs
})

// CORS configuration
export const corsConfig = cors({
  origin:
    process.env.NODE_ENV === 'production'
      ? process.env.ALLOWED_ORIGINS?.split(',') || []
      : ['http://localhost:3000'],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
})

// API route wrapper with security middleware
export function withSecurity(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    // Apply security headers
    securityHeaders(req, res, () => {})

    // Apply CORS
    corsConfig(req, res, () => {})

    // Rate limiting check would go here
    // Additional security checks can be added

    return handler(req, res)
  }
}
