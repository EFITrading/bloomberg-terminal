import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'

import { NextApiRequest } from 'next'

// Password hashing
export const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || '12')
  return bcrypt.hash(password, saltRounds)
}

export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash)
}

// JWT utilities
export const signJWT = (payload: object): string => {
  if (!process.env.NEXTAUTH_SECRET) {
    throw new Error('NEXTAUTH_SECRET is not defined')
  }

  return jwt.sign(payload, process.env.NEXTAUTH_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  } as jwt.SignOptions)
}

export const verifyJWT = (token: string): jwt.JwtPayload | string => {
  if (!process.env.NEXTAUTH_SECRET) {
    throw new Error('NEXTAUTH_SECRET is not defined')
  }

  return jwt.verify(token, process.env.NEXTAUTH_SECRET)
}

// Secure random generators
export const generateSecureToken = (length: number = 32): string => {
  return crypto.randomBytes(length).toString('hex')
}

export const generateOTPSecret = (): string => {
  return crypto.randomBytes(20).toString('hex')
}

// Input sanitization
export const sanitizeString = (input: string): string => {
  return input
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/['"]/g, '') // Remove quotes
    .trim()
    .slice(0, 1000) // Limit length
}

// IP address utilities
export const getClientIP = (req: NextApiRequest): string => {
  const forwarded = req.headers['x-forwarded-for']
  const ip = forwarded
    ? Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded.split(',')[0]
    : req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown'

  return ip.replace(/^::ffff:/, '') // Remove IPv6 prefix if present
}

// Security validation
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email) && email.length <= 254
}

export const isStrongPassword = (password: string): boolean => {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number, 1 special char
  const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
  return strongPasswordRegex.test(password)
}

// Content Security Policy nonce generator
export const generateCSPNonce = (): string => {
  return crypto.randomBytes(16).toString('base64')
}
