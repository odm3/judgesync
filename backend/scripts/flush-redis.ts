#!/usr/bin/env node
/**
 * Flush all data from Upstash Redis
 * WARNING: This deletes ALL data - use only in development!
 */
import '../src/env.js'
import { redisRest } from '../src/redis.js'

async function flushRedis() {
  console.log('⚠️  WARNING: This will delete ALL data from your Redis database!')
  console.log('Redis URL:', process.env.UPSTASH_REDIS_REST_URL)
  console.log('')
  console.log('Press Ctrl+C within 5 seconds to cancel...')

  await new Promise((resolve) => setTimeout(resolve, 5000))

  console.log('Flushing Redis...')

  try {
    // Get all keys and delete them
    const keys = (await redisRest.keys('*')) as string[]

    if (keys.length === 0) {
      console.log('✓ Redis is already empty')
      process.exit(0)
    }

    console.log(`Found ${keys.length} keys to delete`)

    // Delete all keys
    if (keys.length > 0) {
      await redisRest.del(...keys)
    }

    console.log('✓ Successfully flushed Redis database')
    console.log(`✓ Deleted ${keys.length} keys`)
  } catch (error) {
    console.error('✗ Failed to flush Redis:', error)
    process.exit(1)
  }

  process.exit(0)
}

flushRedis()
