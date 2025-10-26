// Load environment variables first, before any other imports
import './env.js'

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { createServer } from 'node:http'
import { Server as SocketIOServer } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { sessionsRoute } from './routes/sessions.js'
import { clearExpiredOtps, setSocketIO } from './store.js'
import { initializeSocketHandlers } from './socket/handlers.js'
import { createNodeListener } from './utils/node-listener.js'
import { connectRedisPubSub, redisPubClient, redisSubClient } from './redis.js'

const app = new Hono()

// Configure CORS with allowed origins from environment
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()) || ['http://localhost:5173', 'http://192.168.4.226:5173']

app.use('*', cors({
  origin: (origin) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return '*'
    // Check if origin is in allowed list
    return allowedOrigins.includes(origin) ? origin : ''
  },
  credentials: true,
}))
app.use('*', logger())

app.onError((err, c) => {
  console.error('❌ Unhandled error:', err)
  console.error('Stack:', err.stack)
  return c.json({ error: { code: 'INTERNAL_ERROR', message: err.message } }, 500)
})

app.route('/api/sessions', sessionsRoute)

app.get('/health', (c) => c.json({ status: 'ok' }))

const port = Number(process.env.PORT || 8787)

// periodic cleanup every minute
setInterval(() => {
  clearExpiredOtps().catch((error) => {
    console.error('Failed to clear expired OTPs', error)
  })
}, 60 * 1000).unref()

const nodeListener = createNodeListener(app)
const httpServer = createServer(nodeListener)

async function bootstrap() {
  await connectRedisPubSub()

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true)
        } else {
          callback(new Error('Not allowed by CORS'))
        }
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    allowUpgrades: true,
  })

  io.adapter(createAdapter(redisPubClient, redisSubClient))

  setSocketIO(io)
  initializeSocketHandlers(io)

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`JudgeSync sharing server running on all interfaces at port ${port}`)
  })
}

bootstrap().catch((error) => {
  console.error('Failed to start server', error)
  process.exit(1)
})
