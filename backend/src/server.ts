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

app.use('*', cors({
  origin: '*',
  credentials: true,
}))
app.use('*', logger())

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
      origin: '*',
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
