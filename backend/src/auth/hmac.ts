import { createHmac, randomBytes } from 'node:crypto'

const HMAC_ALGORITHM = 'sha256'
const masterSecret = process.env.HMAC_MASTER_SECRET || process.env.JWT_SECRET

if (!masterSecret) {
  throw new Error('HMAC_MASTER_SECRET or JWT_SECRET environment variable must be defined')
}

const MASTER_SECRET: string = masterSecret

/**
 * Generate a session-specific signing key derived from the session ID
 * This allows each session to have a unique signing key
 */
export function generateSigningKey(sessionId: string): string {
  const derivedKey = createHmac(HMAC_ALGORITHM, MASTER_SECRET)
    .update(sessionId)
    .digest('base64url')

  return derivedKey
}

/**
 * Generate a random signing key (used when session ID not available)
 */
export function generateRandomSigningKey(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * Create an HMAC signature for a request
 * Signs: METHOD + PATH + TIMESTAMP + BODY_HASH
 */
export function signRequest(
  signingKey: string,
  method: string,
  path: string,
  timestamp: string,
  bodyHash: string,
): string {
  const message = `${method.toUpperCase()}:${path}:${timestamp}:${bodyHash}`

  const signature = createHmac(HMAC_ALGORITHM, signingKey)
    .update(message)
    .digest('base64url')

  return signature
}

/**
 * Verify an HMAC signature for a request
 */
export function verifySignature(
  signingKey: string,
  method: string,
  path: string,
  timestamp: string,
  bodyHash: string,
  expectedSignature: string,
): boolean {
  const computedSignature = signRequest(signingKey, method, path, timestamp, bodyHash)

  // Use constant-time comparison to prevent timing attacks
  return timingSafeEqual(computedSignature, expectedSignature)
}

/**
 * Hash a request body for signature verification
 * Returns empty string for GET requests or empty bodies
 */
export function hashBody(body: string | null | undefined): string {
  if (!body || body.length === 0) {
    return ''
  }

  return createHmac(HMAC_ALGORITHM, 'body')
    .update(body)
    .digest('base64url')
}

/**
 * Validate that a timestamp is recent (within the allowed window)
 * @param timestamp - Unix timestamp in seconds
 * @param maxAgeSeconds - Maximum age in seconds (default: 60)
 */
export function isTimestampValid(timestamp: string, maxAgeSeconds = 60): boolean {
  const timestampNum = Number.parseInt(timestamp, 10)

  if (Number.isNaN(timestampNum)) {
    return false
  }

  const now = Math.floor(Date.now() / 1000)
  const age = now - timestampNum

  // Reject timestamps from the future (with small tolerance for clock skew)
  if (age < -5) {
    return false
  }

  // Reject timestamps older than maxAge
  if (age > maxAgeSeconds) {
    return false
  }

  return true
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }

  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }

  return result === 0
}
