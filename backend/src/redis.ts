import { Redis as UpstashRedis } from '@upstash/redis'
import IORedis from 'ioredis'

const restUrl = process.env.UPSTASH_REDIS_REST_URL
const restToken = process.env.UPSTASH_REDIS_REST_TOKEN
const redisUrl = process.env.UPSTASH_REDIS_URL

if (!restUrl || !restToken) {
  throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be defined')
}

if (!redisUrl) {
  throw new Error('UPSTASH_REDIS_URL must be defined for Socket.IO pub/sub')
}

export const redisRest = new UpstashRedis({
  url: restUrl,
  token: restToken,
})

const baseOptions: IORedis.RedisOptions = {
  lazyConnect: true,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  tls: {
    rejectUnauthorized: false,
  },
}

export const redisPubClient = new IORedis(redisUrl, baseOptions)
export const redisSubClient = redisPubClient.duplicate()

export async function connectRedisPubSub() {
  await Promise.all([
    redisPubClient.connect(),
    redisSubClient.connect(),
  ])
}
