import * as jose from 'jose'
import { randomUUID } from 'node:crypto'
import { redisRest } from '../redis.js'
import type { JudgingRole } from '../types.js'

const JWT_SECRET = process.env.JWT_SECRET
const JWT_ALGORITHM = 'HS256'
const JWT_EXPIRATION = '24h' // 24 hours
const JWT_EXPIRATION_SECONDS = 24 * 60 * 60 // 24 hours in seconds

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable must be defined')
}

const secret = new TextEncoder().encode(JWT_SECRET)

export interface JwtClaims {
  deviceId: string
  sessionCode: string
  role: JudgingRole
  jti: string // JWT ID for revocation
}

export interface JwtPayload extends JwtClaims {
  iat: number
  exp: number
}

/**
 * Generate a JWT token for an authenticated participant and store it in Redis
 * @returns {token, tokenId} - The JWT token and its ID for revocation
 */
export async function generateToken(
  deviceId: string,
  sessionCode: string,
  role: JudgingRole,
): Promise<{ token: string; tokenId: string }> {
  const tokenId = randomUUID()

  const token = await new jose.SignJWT({
    deviceId,
    sessionCode,
    role,
    jti: tokenId,
  })
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRATION)
    .sign(secret)

  // Store token in Redis for revocation support
  await redisRest.set(
    `auth:token:${tokenId}`,
    JSON.stringify({
      deviceId,
      sessionCode,
      role,
      issuedAt: Date.now(),
    }),
    { ex: JWT_EXPIRATION_SECONDS },
  )

  return { token, tokenId }
}

/**
 * Verify and decode a JWT token
 * Checks both signature validity AND Redis whitelist
 * @throws {Error} if token is invalid, expired, revoked, or malformed
 */
export async function verifyToken(token: string): Promise<JwtPayload> {
  try {
    const { payload } = await jose.jwtVerify(token, secret, {
      algorithms: [JWT_ALGORITHM],
    })

    // Validate required claims exist
    if (
      typeof payload.deviceId !== 'string' ||
      typeof payload.sessionCode !== 'string' ||
      typeof payload.role !== 'string' ||
      typeof payload.jti !== 'string' ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number'
    ) {
      throw new Error('Invalid JWT payload structure')
    }

    // Check if token exists in Redis (not revoked)
    const exists = await redisRest.exists(`auth:token:${payload.jti}`)
    if (!exists) {
      throw new Error('Token has been revoked')
    }

    return {
      deviceId: payload.deviceId,
      sessionCode: payload.sessionCode,
      role: payload.role as JudgingRole,
      jti: payload.jti,
      iat: payload.iat,
      exp: payload.exp,
    }
  } catch (error) {
    if (error instanceof jose.errors.JWTExpired) {
      throw new Error('Token has expired')
    }
    if (error instanceof jose.errors.JWTInvalid) {
      throw new Error('Invalid token')
    }
    throw error
  }
}

/**
 * Decode a JWT without verifying (useful for debugging, not for auth)
 */
export function decodeToken(token: string): JwtPayload | null {
  try {
    const decoded = jose.decodeJwt(token)
    if (
      typeof decoded.deviceId === 'string' &&
      typeof decoded.sessionCode === 'string' &&
      typeof decoded.role === 'string' &&
      typeof decoded.jti === 'string' &&
      typeof decoded.iat === 'number' &&
      typeof decoded.exp === 'number'
    ) {
      return {
        deviceId: decoded.deviceId,
        sessionCode: decoded.sessionCode,
        role: decoded.role as JudgingRole,
        jti: decoded.jti,
        iat: decoded.iat,
        exp: decoded.exp,
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Revoke a specific token by deleting it from Redis
 * This causes immediate logout for the token holder
 */
export async function revokeToken(tokenId: string): Promise<void> {
  await redisRest.del(`auth:token:${tokenId}`)
}

/**
 * Revoke all tokens for a given session
 * Useful when a session ends or is deleted
 */
export async function revokeAllTokensForSession(sessionCode: string): Promise<number> {
  // Get all token keys
  const pattern = `auth:token:*`
  const keys = await redisRest.keys(pattern)

  if (!keys || keys.length === 0) {
    return 0
  }

  // Filter tokens that belong to this session
  let revokedCount = 0
  for (const key of keys) {
    const data = await redisRest.get<string>(key)
    if (data) {
      try {
        const tokenData = JSON.parse(data)
        if (tokenData.sessionCode === sessionCode) {
          await redisRest.del(key)
          revokedCount++
        }
      } catch {
        // Invalid data, skip
      }
    }
  }

  return revokedCount
}
