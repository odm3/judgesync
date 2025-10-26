import type { Context, Next } from 'hono'
import { verifyToken } from '../auth/jwt.js'
import type { AuthContext } from '../types.js'

declare module 'hono' {
  interface ContextVariableMap {
    auth: AuthContext
  }
}

/**
 * Middleware to validate JWT and attach auth context to request
 * Expects token in Authorization: Bearer <token> header
 */
export async function requireAuth(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(
      {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid Authorization header. Expected: Authorization: Bearer <token>',
        },
      },
      401,
    )
  }

  const token = authHeader.slice(7) // Remove 'Bearer ' prefix

  try {
    const payload = await verifyToken(token)

    // Attach auth context to request for downstream handlers
    c.set('auth', {
      deviceId: payload.deviceId,
      sessionCode: payload.sessionCode,
      role: payload.role,
    })

    await next()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid or expired token'

    return c.json(
      {
        error: {
          code: 'UNAUTHORIZED',
          message,
        },
      },
      401,
    )
  }
}

/**
 * Helper to get auth context from request (after requireAuth middleware)
 */
export function getAuth(c: Context): AuthContext {
  const auth = c.get('auth')
  if (!auth) {
    throw new Error('Auth context not found. Ensure requireAuth middleware is applied.')
  }
  return auth
}
