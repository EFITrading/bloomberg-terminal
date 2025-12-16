# Removed - AI Chatbot security no longer needed

### 1. Regenerate Your Polygon API Key (Do This Now!)
1. Go to https://polygon.io/dashboard
2. Navigate to API Keys section
3. Delete the current key: `kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf`
4. Generate a new key
5. Copy the new key (keep it private!)

### 2. Secure Environment Setup

Update your `.env.local` file:
```env
# Replace with your NEW API key
POLYGON_API_KEY=your_new_polygon_api_key_here
OLLAMA_URL=http://localhost:11434
AI_MODEL=llama3.1:8b

# Security Configuration
NEXTAUTH_SECRET=8YBXjeaBXmixkrK4rCqiK+IoIGIWkv1jpDA+AaW3V5M=
NEXTAUTH_URL=http://localhost:3000

# Rate Limiting (optional - for Redis)
REDIS_URL="redis://localhost:6379"
```

### 3. Update .gitignore
Make sure your `.gitignore` includes:
```gitignore
# Environment variables
.env.local
.env
.env*.local
*.env

# API keys and secrets
*.key
secrets/
config/keys/

# Security files
.env.production
.env.development
```

### 4. Security Features Already Implemented

#### ✅ Rate Limiting
- 30 requests per minute per IP
- Automatic cleanup of expired limits
- 429 status code for exceeded limits

#### ✅ Input Validation
- Maximum message length: 1000 characters
- XSS protection (blocks script tags, eval, etc.)
- SQL injection prevention
- Type checking and sanitization

#### ✅ API Security
```typescript
// Already implemented in /api/chatbot/route.ts
function validateInput(message: string): boolean {
  if (!message || typeof message !== 'string') return false;
  if (message.length > 1000) return false;
  
  const dangerous = ['<script', 'javascript:', 'eval(', 'function(', 'document.', 'window.'];
  return !dangerous.some(pattern => message.toLowerCase().includes(pattern));
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60000; // 1 minute
  const maxRequests = 30; // 30 requests per minute
  // ... rate limiting logic
}
```

#### ✅ CORS Protection
- Specific origin allowlist
- Proper headers configuration
- Method restrictions

### 5. Additional Security Measures

#### Server-Side Rate Limiting (Redis - Optional)
```javascript
// For production with Redis
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

async function checkRateLimitRedis(ip: string): Promise<boolean> {
  const key = `rate_limit:${ip}`;
  const current = await redis.incr(key);
  
  if (current === 1) {
    await redis.expire(key, 60); // 60 seconds
  }
  
  return current <= 30; // 30 requests per minute
}
```

#### Environment-Specific Configurations
```javascript
// config/security.js
const securityConfig = {
  development: {
    rateLimitWindow: 60000,
    rateLimitRequests: 100,
    allowedOrigins: ['http://localhost:3000']
  },
  production: {
    rateLimitWindow: 60000,
    rateLimitRequests: 30,
    allowedOrigins: ['https://yourdomain.com']
  }
};

export default securityConfig[process.env.NODE_ENV || 'development'];
```

### 6. Monitoring & Alerts

#### API Usage Monitoring
```javascript
// Add to your API route
function logSecurityEvent(type: string, ip: string, details: any) {
  console.log(`[SECURITY] ${type}:`, {
    timestamp: new Date().toISOString(),
    ip,
    details,
    userAgent: details.userAgent
  });
  
  // In production, send to monitoring service
  // await sendToDatadog({ type, ip, details });
}
```

#### Set up alerts for:
- Unusual API usage patterns
- High error rates
- Multiple rate limit violations
- Potential injection attempts

### 7. Production Deployment Checklist

#### Environment Variables
```bash
# Production .env (never commit this)
POLYGON_API_KEY=prod_api_key_here
NEXTAUTH_SECRET=super_secure_random_string
NEXTAUTH_URL=https://yourdomain.com
NODE_ENV=production

# Optional production services
REDIS_URL=redis://prod-redis:6379
DATABASE_URL=postgresql://user:pass@prod-db:5432/db
MONITORING_KEY=your_monitoring_service_key
```

#### Security Headers
```javascript
// next.config.ts
const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on'
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload'
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'Referrer-Policy',
    value: 'origin-when-cross-origin'
  }
];

module.exports = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};
```

### 8. Testing Security

#### Test Rate Limiting
```bash
# Test rate limiting with curl
for i in {1..35}; do
  curl -X POST http://localhost:3000/api/chatbot \
    -H "Content-Type: application/json" \
    -d '{"message":"test"}' &
done
```

#### Test Input Validation
```bash
# Test XSS protection
curl -X POST http://localhost:3000/api/chatbot \
  -H "Content-Type: application/json" \
  -d '{"message":"<script>alert(\"xss\")</script>"}'
```

## Quick Security Fix Checklist

1. ✅ **Regenerate Polygon API key immediately**
2. ✅ **Update .env.local with new key**
3. ✅ **Verify .gitignore includes .env files**
4. ✅ **Test rate limiting functionality**
5. ✅ **Verify input validation works**
6. ✅ **Check CORS configuration**
7. ✅ **Monitor API usage patterns**
8. ✅ **Set up production environment variables**

## Security Best Practices

### API Key Management
- ✅ Use different keys for dev/staging/production
- ✅ Rotate keys regularly (every 90 days)
- ✅ Monitor usage in Polygon.io dashboard
- ✅ Set up usage alerts and limits

### Code Security
- ✅ Never log sensitive data
- ✅ Use environment variables for all secrets
- ✅ Implement proper error handling
- ✅ Regular dependency updates

### Infrastructure Security
- ✅ Use HTTPS in production
- ✅ Implement proper CORS policies
- ✅ Set up security headers
- ✅ Use secure session management

Remember: **API keys are like passwords** - treat them with the same level of security!

## Emergency Response

If you suspect a security breach:

1. **Immediately** regenerate all API keys
2. Check logs for unusual activity patterns
3. Review and rotate all environment variables
4. Monitor for unauthorized API usage
5. Update security measures as needed

For questions or security concerns, review this documentation and implement the recommended measures immediately.
