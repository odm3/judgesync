import Dexie, { type Table } from 'dexie'

export interface NotebookScoreRecord {
  id: string
  sessionId: string
  eventSku: string
  judgeTeamId: string
  teamNumber: string
  scores: Record<string, number> // criterionId -> score
  totalScore: number
  notes?: string
  gradeLevel?: 'ES' | 'MS' | 'HS' | 'University'
  judgeName?: string
  digitalNotebookUrl?: string
  createdAt: number
  updatedAt: number
  createdBy: string
  synced: boolean // Track if synced to server
}

export interface InterviewScoreRecord {
  id: string
  sessionId: string
  eventSku: string
  judgeTeamId: string
  teamNumber: string
  scores: Record<string, number> // criterionId -> score
  totalScore: number
  notes?: string
  gradeLevel?: 'ES' | 'MS' | 'HS' | 'University'
  judgeName?: string
  specialAttributes?: string
  interviewDuration?: number
  createdAt: number
  updatedAt: number
  createdBy: string
  synced: boolean // Track if synced to server
}

export interface NominationRecord {
  id: string
  sessionId: string
  eventSku: string
  judgeTeamId: string
  teamNumber: string
  awardCategory: string
  notes?: string
  createdAt: number
  createdBy: string
  synced: boolean // Track if synced to server
}

class JudgingDB extends Dexie {
  notebookScores!: Table<NotebookScoreRecord, string>
  interviewScores!: Table<InterviewScoreRecord, string>
  nominations!: Table<NominationRecord, string>

  constructor() {
    super('JudgeSyncJudging')
    this.version(1).stores({
      notebookScores: 'id, sessionId, eventSku, teamNumber, judgeTeamId, createdAt, synced',
      interviewScores: 'id, sessionId, eventSku, teamNumber, judgeTeamId, createdAt, synced',
      nominations: 'id, sessionId, eventSku, teamNumber, judgeTeamId, awardCategory, createdAt, synced',
    })
  }
}

const db = new JudgingDB()

// ============================================================================
// Notebook Scores
// ============================================================================

export async function saveNotebookScore(score: NotebookScoreRecord) {
  await db.notebookScores.put(score)
  return score
}

export async function getNotebookScore(id: string) {
  return await db.notebookScores.get(id)
}

export async function listNotebookScores(eventSku: string) {
  const records = await db.notebookScores
    .where('eventSku')
    .equals(eventSku)
    .toArray()

  return records.sort((a, b) => b.createdAt - a.createdAt)
}

export async function listNotebookScoresByTeam(eventSku: string, teamNumber: string) {
  const records = await db.notebookScores
    .where('[eventSku+teamNumber]')
    .equals([eventSku, teamNumber])
    .toArray()

  return records.sort((a, b) => b.createdAt - a.createdAt)
}

export async function updateNotebookScore(id: string, updates: Partial<NotebookScoreRecord>) {
  await db.notebookScores.update(id, {
    ...updates,
    updatedAt: Date.now(),
    synced: false, // Mark as unsynced when updated locally
  })
}

export async function deleteNotebookScore(id: string) {
  await db.notebookScores.delete(id)
}

export async function listUnsyncedNotebookScores() {
  return await db.notebookScores
    .where('synced')
    .equals(0)
    .toArray()
}

export async function markNotebookScoreSynced(id: string) {
  await db.notebookScores.update(id, { synced: true })
}

// ============================================================================
// Interview Scores
// ============================================================================

export async function saveInterviewScore(score: InterviewScoreRecord) {
  await db.interviewScores.put(score)
  return score
}

export async function getInterviewScore(id: string) {
  return await db.interviewScores.get(id)
}

export async function listInterviewScores(eventSku: string) {
  const records = await db.interviewScores
    .where('eventSku')
    .equals(eventSku)
    .toArray()

  return records.sort((a, b) => b.createdAt - a.createdAt)
}

export async function listInterviewScoresByTeam(eventSku: string, teamNumber: string) {
  const records = await db.interviewScores
    .where('[eventSku+teamNumber]')
    .equals([eventSku, teamNumber])
    .toArray()

  return records.sort((a, b) => b.createdAt - a.createdAt)
}

export async function updateInterviewScore(id: string, updates: Partial<InterviewScoreRecord>) {
  await db.interviewScores.update(id, {
    ...updates,
    updatedAt: Date.now(),
    synced: false, // Mark as unsynced when updated locally
  })
}

export async function deleteInterviewScore(id: string) {
  await db.interviewScores.delete(id)
}

export async function listUnsyncedInterviewScores() {
  return await db.interviewScores
    .where('synced')
    .equals(0)
    .toArray()
}

export async function markInterviewScoreSynced(id: string) {
  await db.interviewScores.update(id, { synced: true })
}

// ============================================================================
// Nominations
// ============================================================================

export async function saveNomination(nomination: NominationRecord) {
  await db.nominations.put(nomination)
  return nomination
}

export async function getNomination(id: string) {
  return await db.nominations.get(id)
}

export async function listNominations(eventSku: string) {
  const records = await db.nominations
    .where('eventSku')
    .equals(eventSku)
    .toArray()

  return records.sort((a, b) => b.createdAt - a.createdAt)
}

export async function listNominationsByTeam(eventSku: string, teamNumber: string) {
  const records = await db.nominations
    .where('[eventSku+teamNumber]')
    .equals([eventSku, teamNumber])
    .toArray()

  return records.sort((a, b) => b.createdAt - a.createdAt)
}

export async function deleteNomination(id: string) {
  await db.nominations.delete(id)
}

export async function listUnsyncedNominations() {
  return await db.nominations
    .where('synced')
    .equals(0)
    .toArray()
}

export async function markNominationSynced(id: string) {
  await db.nominations.update(id, { synced: true })
}

// ============================================================================
// Sync Utilities
// ============================================================================

/**
 * Get all unsynced judging data (scores and nominations)
 */
export async function getAllUnsyncedData() {
  const [notebookScores, interviewScores, nominations] = await Promise.all([
    listUnsyncedNotebookScores(),
    listUnsyncedInterviewScores(),
    listUnsyncedNominations(),
  ])

  return {
    notebookScores,
    interviewScores,
    nominations,
  }
}

/**
 * Clear all judging data for a specific event (useful for cleanup)
 */
export async function clearEventData(eventSku: string) {
  await Promise.all([
    db.notebookScores.where('eventSku').equals(eventSku).delete(),
    db.interviewScores.where('eventSku').equals(eventSku).delete(),
    db.nominations.where('eventSku').equals(eventSku).delete(),
  ])
}

export { db as judgingDB }
