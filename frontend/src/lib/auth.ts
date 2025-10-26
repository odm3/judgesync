const AUTH_STORAGE_KEY = 'judgesync:auth'

export interface AuthData {
  token: string
  signingKey: string
  expiresAt: number
  tokenId?: string
}

/**
 * Store authentication data (JWT + signing key) in localStorage
 */
export function storeAuth(auth: AuthData): void {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth))
}

/**
 * Retrieve authentication data from localStorage
 * Returns null if no auth data or if token is expired
 */
export function getAuth(): AuthData | null {
  const stored = localStorage.getItem(AUTH_STORAGE_KEY)
  if (!stored) return null

  try {
    const auth = JSON.parse(stored) as AuthData

    // Check if token is expired
    if (Date.now() >= auth.expiresAt) {
      clearAuth()
      return null
    }

    return auth
  } catch {
    // Invalid JSON, clear it
    clearAuth()
    return null
  }
}

/**
 * Clear authentication data from localStorage
 */
export function clearAuth(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY)
}

/**
 * Get current JWT token, or null if not authenticated/expired
 */
export function getAuthToken(): string | null {
  const auth = getAuth()
  return auth?.token || null
}

/**
 * Create HMAC signature for a request using Web Crypto API
 * @param method - HTTP method (GET, POST, etc.)
 * @param path - Request path (e.g., /api/sessions/ABC123/field-notes)
 * @param timestamp - Unix timestamp in seconds
 * @param signingKey - Session-specific signing key
 * @returns Base64url-encoded signature
 */
export async function signRequest(
  method: string,
  path: string,
  timestamp: number,
  signingKey: string,
): Promise<string> {
  const encoder = new TextEncoder()

  // Create message: METHOD:PATH:TIMESTAMP:BODYHASH
  // For now, we're not hashing the body (empty string)
  const message = `${method.toUpperCase()}:${path}:${timestamp}:`

  // Import signing key for HMAC
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(signingKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  // Sign the message
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message))

  // Convert to base64url (URL-safe base64)
  return arrayBufferToBase64Url(signature)
}

/**
 * Convert ArrayBuffer to base64url string
 */
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }

  // Convert to base64 then make URL-safe
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/**
 * Check if current auth is valid (exists and not expired)
 */
export function isAuthenticated(): boolean {
  return getAuth() !== null
}
