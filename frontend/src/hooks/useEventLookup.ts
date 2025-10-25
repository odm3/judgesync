import { useState, useCallback } from 'react'
import { fetchEventBySku } from '@/services/robotevents'
import type { EventData } from '@/types/robotevents'
import { RobotEventsError } from '@/types/robotevents'
import Dexie, { type Table } from 'dexie'

// Define IndexedDB schema for caching events
class EventCache extends Dexie {
  events!: Table<EventData & { cachedAt: number }, number>

  constructor() {
    super('JudgeSyncEventCache')
    this.version(1).stores({
      events: 'id, sku, cachedAt',
    })
  }
}

const db = new EventCache()

// Cache duration: 1 hour
const CACHE_DURATION_MS = 60 * 60 * 1000

interface UseEventLookupResult {
  event: EventData | null
  isLoading: boolean
  error: string | null
  lookupEvent: (sku: string) => Promise<void>
  clearError: () => void
  reset: () => void
}

export function useEventLookup(): UseEventLookupResult {
  const [event, setEvent] = useState<EventData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const reset = useCallback(() => {
    setEvent(null)
    setError(null)
    setIsLoading(false)
  }, [])

  const getCachedEvent = useCallback(async (sku: string): Promise<EventData | null> => {
    try {
      const cached = await db.events.where('sku').equals(sku).first()

      if (cached) {
        const now = Date.now()
        const age = now - cached.cachedAt

        // Return cached event if it's still fresh
        if (age < CACHE_DURATION_MS) {
          // Remove cachedAt before returning
          const { cachedAt, ...eventData } = cached
          return eventData
        }

        // Remove stale cache entry
        await db.events.delete(cached.id)
      }

      return null
    } catch (error) {
      console.error('Error reading from cache:', error)
      return null
    }
  }, [])

  const cacheEvent = useCallback(async (eventData: EventData): Promise<void> => {
    try {
      await db.events.put({
        ...eventData,
        cachedAt: Date.now(),
      })
    } catch (error) {
      console.error('Error writing to cache:', error)
    }
  }, [])

  const lookupEvent = useCallback(
    async (sku: string) => {
      setIsLoading(true)
      setError(null)

      try {
        // Try to get from cache first
        const cachedEvent = await getCachedEvent(sku)

        if (cachedEvent) {
          setEvent(cachedEvent)
          setIsLoading(false)
          return
        }

        // Fetch from API
        const eventData = await fetchEventBySku(sku)

        // Cache the result
        await cacheEvent(eventData)

        setEvent(eventData)
      } catch (err) {
        if (err instanceof RobotEventsError) {
          setError(err.message)
        } else if (err instanceof Error) {
          setError(err.message)
        } else {
          setError('An unexpected error occurred')
        }
        setEvent(null)
      } finally {
        setIsLoading(false)
      }
    },
    [getCachedEvent, cacheEvent]
  )

  return {
    event,
    isLoading,
    error,
    lookupEvent,
    clearError,
    reset,
  }
}
