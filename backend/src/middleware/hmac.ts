import type { Context, Next } from 'hono'
import { hashBody, isTimestampValid, verifySignature } from '../auth/hmac.js'
import { getSigningKeyByDeviceId } from '../store.js'
import { getAuth } from './auth.js'

/**
 * Middleware to validate HMAC request signatures
 * Requires auth middleware to be applied first
 */
export async function requireSignature(c: Context, next: Next) {
  const signature = c.req.header('X-Signature')
  const timestamp = c.req.header('X-Timestamp')

  if (!signature) {
    return c.json(
      {
        error: {
          code: 'SIGNATURE_REQUIRED',
          message: 'X-Signature header is required for this endpoint',
        },
      },
      400,
    )
  }

  if (!timestamp) {
    return c.json(
      {
        error: {
          code: 'TIMESTAMP_REQUIRED',
          message: 'X-Timestamp header is required for this endpoint',
        },
      },
      400,
    )
  }

  // Validate timestamp is recent (prevents replay attacks)
  if (!isTimestampValid(timestamp, 60)) {
    return c.json(
      {
        error: {
          code: 'TIMESTAMP_INVALID',
          message: 'Request timestamp is too old or invalid. Ensure clock synchronization.',
        },
      },
      400,
    )
  }

  const auth = getAuth(c)
  const { sessionCode, deviceId } = auth

  // Get the signing key for this participant
  const signingKey = await getSigningKeyByDeviceId(sessionCode, deviceId)

  if (!signingKey) {
    return c.json(
      {
        error: {
          code: 'SIGNING_KEY_NOT_FOUND',
          message: 'Signing key not found for this participant',
        },
      },
      403,
    )
  }

  // Get request details
  const method = c.req.method
  const path = c.req.path

  // Hash body for verification (empty for GET/DELETE)
  const bodyHash = hashBody('')

  // Verify signature
  const isValid = verifySignature(signingKey, method, path, timestamp, bodyHash, signature)

  if (!isValid) {
    return c.json(
      {
        error: {
          code: 'SIGNATURE_INVALID',
          message: 'Request signature verification failed',
        },
      },
      403,
    )
  }

  await next()
}
