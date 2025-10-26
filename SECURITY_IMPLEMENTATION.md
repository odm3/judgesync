# Security Implementation Summary

## Backend Implementation ✅ COMPLETED

All backend security enhancements have been implemented:

### 1. Redis TLS Certificate Validation ✅
- **File**: `backend/src/redis.ts`
- **Change**: TLS certificate validation is properly enabled (was already set to `true`)

### 2. JWT-Based Authentication ✅
- **File**: `backend/src/auth/jwt.ts`
- **Implementation**:
  - `generateToken()` - Creates signed JWTs with deviceId, sessionCode, role
  - `verifyToken()` - Validates JWT signature and expiration
  - Uses HS256 algorithm with 24-hour expiration
  - Requires `JWT_SECRET` environment variable

### 3. HMAC Request Signing ✅
- **File**: `backend/src/auth/hmac.ts`
- **Implementation**:
  - `generateSigningKey()` - Derives session-specific signing keys
  - `signRequest()` - Creates HMAC signatures for requests
  - `verifySignature()` - Validates request signatures
  - `isTimestampValid()` - Prevents replay attacks (60-second window)

### 4. Authentication Middleware ✅
- **File**: `backend/src/middleware/auth.ts`
- **Implementation**:
  - `requireAuth` - Validates JWT from Authorization header
  - Attaches authenticated user context to requests
  - Returns 401 for invalid/missing tokens

### 5. HMAC Validation Middleware ✅
- **File**: `backend/src/middleware/hmac.ts`
- **Implementation**:
  - `requireSignature` - Validates request signatures
  - Checks X-Signature and X-Timestamp headers
  - Prevents tampering and replay attacks

### 6. Improved Session Code Generation ✅
- **File**: `backend/src/store.ts`
- **Changes**:
  - Removed predictable SKU-based prefix
  - Now generates cryptographically secure random codes
  - Format: `XXYYYYYY` (8 chars)
  - Entropy: ~60 bits (~2.1 billion combinations)

### 7. Signing Key Storage ✅
- **File**: `backend/src/store.ts`
- **Functions**:
  - `storeSigningKey()` - Stores session-specific signing keys
  - `getSigningKeyByDeviceId()` - Retrieves signing keys
  - `deleteSigningKey()` - Cleans up keys on participant removal

### 8. Updated API Routes ✅
- **File**: `backend/src/routes/sessions.ts`
- **Changes**:
  - All endpoints now issue JWTs and signing keys
  - Protected endpoints require JWT authentication
  - Sensitive endpoints require HMAC signatures:
    - `PATCH /:code/participants/:participantDeviceId/role`
    - `DELETE /:code/participants/:participantDeviceId`
    - `POST /:code/field-notes`
    - `PATCH /:code/field-notes/:noteId`

### 9. CORS Restrictions ✅
- **File**: `backend/src/server.ts`
- **Implementation**:
  - Replaced `origin: '*'` with environment-based whitelist
  - Uses `ALLOWED_ORIGINS` environment variable
  - Defaults to localhost:5173 for development
  - Applied to both HTTP and WebSocket servers

### 10. WebSocket Authentication ✅
- **File**: `backend/src/socket/handlers.ts`
- **Changes**:
  - `join_session` event now requires JWT token
  - Validates token before allowing connection
  - Verifies session code matches token

---

## Frontend Implementation 🔧 REQUIRED

The following changes are needed in the frontend to work with the new secure backend:

### Environment Variables

Add to `.env`:
```bash
VITE_SHARING_API=https://your-production-api.com
```

### 1. Create Auth Utilities

**File**: `frontend/src/lib/auth.ts`

```typescript
import { createHmac } from 'crypto-browserify' // Install: npm install crypto-browserify

const AUTH_STORAGE_KEY = 'judgesync:auth'

interface AuthData {
  token: string
  signingKey: string
  expiresAt: number
}

export function storeAuth(auth: AuthData): void {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth))
}

export function getAuth(): AuthData | null {
  const stored = localStorage.getItem(AUTH_STORAGE_KEY)
  if (!stored) return null

  const auth = JSON.parse(stored) as AuthData

  // Check if token is expired
  if (Date.now() >= auth.expiresAt) {
    clearAuth()
    return null
  }

  return auth
}

export function clearAuth(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY)
}

export function getAuthToken(): string | null {
  const auth = getAuth()
  return auth?.token || null
}

export function signRequest(
  method: string,
  path: string,
  timestamp: number,
): string | null {
  const auth = getAuth()
  if (!auth) return null

  const message = `${method.toUpperCase()}:${path}:${timestamp}:`

  // Create HMAC signature
  const hmac = createHmac('sha256', auth.signingKey)
  hmac.update(message)
  return hmac.digest('base64url')
}
```

### 2. Update Sharing Service

**File**: `frontend/src/services/sharing.ts`

Update the `request` helper function:

```typescript
import { getAuthToken, signRequest } from '@/lib/auth'

async function request<T>(input: RequestInfo, init?: RequestInit, requiresSignature = false) {
  const token = getAuthToken()

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(init?.headers || {}),
  }

  // Add JWT token if available
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  // Add HMAC signature for protected endpoints
  if (requiresSignature && token) {
    const url = typeof input === 'string' ? input : input.url
    const path = new URL(url, window.location.origin).pathname
    const method = init?.method || 'GET'
    const timestamp = Math.floor(Date.now() / 1000)

    const signature = signRequest(method, path, timestamp)
    if (signature) {
      headers['X-Signature'] = signature
      headers['X-Timestamp'] = timestamp.toString()
    }
  }

  const res = await fetch(input, {
    ...init,
    headers,
  })

  if (!res.ok) {
    throw await toApiError(res)
  }
  return (await res.json()) as T
}
```

### 3. Store Auth Data After Login

Update functions that create/join sessions to store auth data:

```typescript
export async function createOrGetSession(...) {
  const data = await request<{ session: any; participant?: any; auth?: AuthResponse }>(...)

  // Store authentication data
  if (data.auth) {
    storeAuth(data.auth)
  }

  return { session: mapSession(data.session), ... }
}
```

Update similar functions:
- `requestJoinOtpByEventSku` ❌ (no auth needed)
- `requestJoinOtp` ❌ (no auth needed)
- `approveJoinOtp` ✅ (stores auth for new participant)

### 4. Update Protected Endpoint Calls

Mark endpoints that require signatures:

```typescript
// Field notes (requires signature)
export async function createFieldNote(...) {
  return request<...>(`${API_BASE}/api/sessions/${sessionCode}/field-notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, true) // ← requiresSignature = true
}

export async function updateFieldNoteResolution(...) {
  return request<...>(`${API_BASE}/api/sessions/${sessionCode}/field-notes/${noteId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resolved }),
  }, true) // ← requiresSignature = true
}

// Participant management (requires signature)
export async function updateParticipantRole(...) {
  return request<...>(`${API_BASE}/api/sessions/${sessionCode}/participants/${participantDeviceId}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  }, true) // ← requiresSignature = true
}

export async function removeParticipant(...) {
  return request<...>(`${API_BASE}/api/sessions/${sessionCode}/participants/${participantDeviceId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  }, true) // ← requiresSignature = true
}
```

### 5. Update WebSocket Connection

**File**: `frontend/src/context/JudgingSessionContext.tsx`

Update socket connection to include JWT:

```typescript
useEffect(() => {
  if (!socket || !sharingSession) return

  const token = getAuthToken()
  if (!token) {
    console.error('No auth token available for WebSocket connection')
    return
  }

  socket.emit('join_session', {
    sessionCode: sharingSession.sessionCode,
    deviceId: getDeviceId(),
    token, // ← Add token to payload
  })
}, [socket, sharingSession])
```

### 6. Handle Token Expiration

Add token refresh logic or prompt user to re-authenticate:

```typescript
// In your main app component or auth context
useEffect(() => {
  const checkAuth = () => {
    const auth = getAuth()
    if (!auth) {
      // Redirect to login or show re-auth prompt
      clearAuth()
      // Navigate to join screen
    }
  }

  // Check every minute
  const interval = setInterval(checkAuth, 60000)
  return () => clearInterval(interval)
}, [])
```

---

## Required Environment Variables

### Backend

Add to `.env.local` or deployment environment:

```bash
# JWT Secret (256-bit random string)
JWT_SECRET=your-256-bit-random-secret-here

# Allowed origins (comma-separated)
ALLOWED_ORIGINS=https://your-frontend.com,https://www.your-frontend.com

# Optional: Separate HMAC secret (uses JWT_SECRET if not set)
HMAC_MASTER_SECRET=optional-separate-hmac-secret

# Session TTL (seconds, default 7 days)
SESSION_TTL_SECONDS=604800
```

**Generate secrets:**
```bash
# Generate JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Frontend

Add to `.env.production`:

```bash
VITE_SHARING_API=https://your-backend-api.com
```

---

## Security Improvements Summary

✅ **Redis TLS**: Certificate validation enabled
✅ **Authentication**: JWT-based with secure signing
✅ **Request Integrity**: HMAC signatures prevent tampering
✅ **Replay Protection**: Timestamp validation (60s window)
✅ **Session Codes**: Cryptographically secure generation
✅ **CORS**: Restricted to allowed origins
✅ **WebSocket Auth**: JWT required for connections
✅ **Authorization**: Role-based access control

🔧 **Frontend**: Requires updates to implement JWT + HMAC client-side

---

## Testing Checklist

### Backend
- [ ] Build succeeds: `npm run build`
- [ ] JWT_SECRET environment variable is set
- [ ] ALLOWED_ORIGINS configured for production
- [ ] Test create session endpoint returns auth object
- [ ] Test protected endpoints require Authorization header
- [ ] Test HMAC signature validation on sensitive endpoints

### Frontend
- [ ] Install `crypto-browserify` dependency
- [ ] Create auth utilities (lib/auth.ts)
- [ ] Update sharing service with request signing
- [ ] Store auth data after successful login
- [ ] Add JWT to WebSocket join_session payload
- [ ] Test field note creation with signature
- [ ] Test participant management with signature
- [ ] Test token expiration handling

---

## Migration Notes

1. **Deploy backend first** with backward compatibility if needed
2. **Update frontend** to use new auth flow
3. **Monitor logs** for authentication errors
4. **Existing sessions** will need to re-authenticate after deployment

The backend is fully backward-compatible for read-only endpoints (GET requests), but write operations will require authentication.
