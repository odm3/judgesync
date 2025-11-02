import type {
  NotebookScore,
  InterviewScore,
  TeamJudgingNote,
  TeamNomination,
} from '@/context/JudgingSessionContext'
import { getAuthToken } from '@/lib/auth'
import { signRequest } from '@/lib/auth'
import { getAuth } from '@/lib/auth'

const API_BASE = import.meta.env.VITE_SHARING_API ?? 'http://localhost:8787'

async function toApiError(res: Response) {
  try {
    const payload = await res.json()
    if (payload?.error?.message) {
      return new Error(payload.error.message)
    }
  } catch (_) {
    /* ignore */
  }
  return new Error(`Request failed with status ${res.status}`)
}

async function request<T>(input: RequestInfo, init?: RequestInit, requiresSignature = false) {
  const token = getAuthToken()

  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> || {}),
  }

  // Add JWT token if available
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  // Add HMAC signature for protected endpoints
  if (requiresSignature && token) {
    const url = typeof input === 'string' ? input : input.url
    const parsedUrl = new URL(url, window.location.origin)
    const path = parsedUrl.pathname
    const method = init?.method || 'GET'
    const timestamp = Math.floor(Date.now() / 1000)

    const authData = getAuth()
    if (authData) {
      const signature = await signRequest(method, path, timestamp, authData.signingKey)
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

// Notebook Scores
export interface CreateNotebookScorePayload {
  judgeTeamId: string
  teamNumber: string
  scores: Record<string, number>
  totalScore: number
  notes?: string
  gradeLevel?: 'ES' | 'MS' | 'HS' | 'University'
  judgeName?: string
  digitalNotebookUrl?: string
}

export async function createNotebookScore(
  sessionCode: string,
  payload: CreateNotebookScorePayload
): Promise<NotebookScore> {
  const data = await request<{ score: NotebookScore }>(
    `${API_BASE}/api/sessions/${sessionCode}/notebook-scores`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    true
  )
  return data.score
}

export async function updateNotebookScore(
  sessionCode: string,
  scoreId: string,
  payload: Partial<CreateNotebookScorePayload>
): Promise<NotebookScore> {
  const data = await request<{ score: NotebookScore }>(
    `${API_BASE}/api/sessions/${sessionCode}/notebook-scores/${scoreId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    true
  )
  return data.score
}

// Interview Scores
export interface CreateInterviewScorePayload {
  judgeTeamId: string
  teamNumber: string
  scores: Record<string, number>
  totalScore: number
  notes?: string
  gradeLevel?: 'ES' | 'MS' | 'HS' | 'University'
  judgeName?: string
  specialAttributes?: string
  interviewDuration?: number
}

export async function createInterviewScore(
  sessionCode: string,
  payload: CreateInterviewScorePayload
): Promise<InterviewScore> {
  const data = await request<{ score: InterviewScore }>(
    `${API_BASE}/api/sessions/${sessionCode}/interview-scores`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    true
  )
  return data.score
}

export async function updateInterviewScore(
  sessionCode: string,
  scoreId: string,
  payload: Partial<CreateInterviewScorePayload>
): Promise<InterviewScore> {
  const data = await request<{ score: InterviewScore }>(
    `${API_BASE}/api/sessions/${sessionCode}/interview-scores/${scoreId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    true
  )
  return data.score
}

// Team Judging Notes
export interface CreateJudgingNotePayload {
  teamNumber: string
  content: string
  category?: 'general' | 'interview' | 'notebook' | 'robot' | 'team_dynamics'
}

export async function createJudgingNote(
  sessionCode: string,
  payload: CreateJudgingNotePayload
): Promise<TeamJudgingNote> {
  const data = await request<{ note: TeamJudgingNote }>(
    `${API_BASE}/api/sessions/${sessionCode}/judging-notes`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    true
  )
  return data.note
}

export async function updateJudgingNote(
  sessionCode: string,
  noteId: string,
  payload: { content: string; category?: string }
): Promise<TeamJudgingNote> {
  const data = await request<{ note: TeamJudgingNote }>(
    `${API_BASE}/api/sessions/${sessionCode}/judging-notes/${noteId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    true
  )
  return data.note
}

export async function deleteJudgingNote(
  sessionCode: string,
  noteId: string
): Promise<void> {
  await request(
    `${API_BASE}/api/sessions/${sessionCode}/judging-notes/${noteId}`,
    { method: 'DELETE' },
    true
  )
}

// Conflicts of Interest
export interface CreateConflictPayload {
  judgeDeviceId: string
  teamNumber: string
  reason?: string
}

export async function createConflict(
  sessionCode: string,
  payload: CreateConflictPayload
): Promise<any> {
  const data = await request<{ conflict: any }>(
    `${API_BASE}/api/sessions/${sessionCode}/conflicts`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    true
  )
  return data.conflict
}

// Team Nominations
export interface CreateNominationPayload {
  teamNumber: string
  awardCategory: string
  reason?: string
}

export async function createNomination(
  sessionCode: string,
  payload: CreateNominationPayload
): Promise<TeamNomination> {
  const data = await request<{ nomination: TeamNomination }>(
    `${API_BASE}/api/sessions/${sessionCode}/nominations`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    true
  )
  return data.nomination
}

export async function deleteNomination(
  sessionCode: string,
  nominationId: string
): Promise<void> {
  await request(
    `${API_BASE}/api/sessions/${sessionCode}/nominations/${nominationId}`,
    { method: 'DELETE' },
    true
  )
}
