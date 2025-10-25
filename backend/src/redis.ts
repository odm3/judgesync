import { Redis as UpstashRedis } from '@upstash/redis'
import * as IORedisModule from 'ioredis'
import type { Redis as RedisClient, RedisOptions } from 'ioredis'

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

const baseOptions: RedisOptions = {
  lazyConnect: true,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  tls: {
    rejectUnauthorized: false,
  },
}

type RedisConstructor = new (connectionString: string, options: RedisOptions) => RedisClient

const rawExport = IORedisModule as unknown as { default?: RedisConstructor }
const RedisConstructor = (rawExport.default ?? (IORedisModule as unknown as RedisConstructor)) as RedisConstructor

export const redisPubClient: RedisClient = new RedisConstructor(redisUrl, baseOptions)
export const redisSubClient: RedisClient = redisPubClient.duplicate()

export async function connectRedisPubSub() {
  await Promise.all([
    redisPubClient.connect(),
    redisSubClient.connect(),
  ])
}
