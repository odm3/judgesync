# JudgeSync Backend

Backend server for JudgeSync multi-user session sharing with real-time WebSocket communication.

## Tech Stack

- **Framework**: Hono (TypeScript web framework)
- **Runtime**: Node.js 22+
- **Database**: Upstash Redis (REST + pub/sub)
- **WebSockets**: Socket.IO with Redis adapter
- **Authentication**: JWT (HS256) with HMAC request signing

## Local Development Setup

### Prerequisites

- Node.js 22 or later
- Upstash Redis account ([console.upstash.com](https://console.upstash.com/))

### Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment variables**:
   ```bash
   cp .env.example .env.local
   ```

3. **Edit `.env.local`** with your actual values:
   - Get Upstash Redis credentials from your Upstash console
   - Generate a secure JWT secret:
     ```bash
     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
     ```

### Running Locally

```bash
npm run dev
```

This will:
- Build the TypeScript code
- Start the server on port 8787 (or `PORT` from `.env.local`)
- Connect to Upstash Redis
- Enable hot reload for development

The server will be available at `http://localhost:8787`

### Testing the API

**Health check**:
```bash
curl http://localhost:8787/health
```

**Create a session**:
```bash
curl -X POST http://localhost:8787/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "eventSku": "RE-VRC-TEST",
    "deviceId": "device-123",
    "displayName": "Test User"
  }'
```

**Get session**:
```bash
# Replace ABCD1234 with actual session code from previous response
curl http://localhost:8787/api/sessions/ABCD1234
```

## Docker Deployment

Build and run with Docker Compose:

```bash
cd ..
docker-compose up --build
```

## Environment Variables

See `.env.example` for all available configuration options.

### Required Variables

- `UPSTASH_REDIS_REST_URL` - Upstash Redis REST endpoint
- `UPSTASH_REDIS_REST_TOKEN` - Upstash Redis REST token
- `UPSTASH_REDIS_URL` - Upstash Redis connection string (for Socket.IO)
- `JWT_SECRET` - Secret key for JWT signing (min 32 bytes)

### Optional Variables

- `PORT` - Server port (default: 8787)
- `ALLOWED_ORIGINS` - Comma-separated CORS origins
- `SESSION_TTL_SECONDS` - Session TTL in seconds (default: 604800 = 7 days)
- `HMAC_MASTER_SECRET` - HMAC signing secret (defaults to JWT_SECRET)

## Security Features

- **JWT Authentication**: HS256 tokens with 24-hour expiration
- **HMAC Request Signing**: SHA-256 signatures for sensitive operations
- **Token Revocation**: Redis-backed whitelist for instant logout
- **CORS Protection**: Configurable allowed origins
- **TLS Encryption**: All Redis connections use TLS

## Project Structure

```
backend/
├── src/
│   ├── auth/           # JWT and HMAC authentication
│   ├── middleware/     # Auth and signature validation
│   ├── routes/         # API endpoints
│   ├── socket/         # WebSocket handlers
│   ├── env.ts         # Environment configuration
│   ├── redis.ts       # Redis clients
│   ├── server.ts      # Main entry point
│   ├── store.ts       # Data layer
│   └── types.ts       # TypeScript types
├── dist/              # Compiled JavaScript (gitignored)
└── .env.local         # Local environment vars (gitignored)
```

## API Documentation

See `/docs/sharing-server-spec.md` for detailed API documentation.
