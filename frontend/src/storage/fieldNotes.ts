import Dexie, { type Table } from 'dexie'
import type { JudgingRole } from '@/context/JudgingSessionContext'

export interface FieldNoteRecord {
  id?: number
  eventSku: string
  createdAt: number
  reporterName: string
  reporterRole: JudgingRole
  division: string
  fieldLocation: string
  matchIdentifier: string
  teamsInvolved: string
  issueSummary: string
  priority: 'normal' | 'urgent'
  sentiment: 'positive' | 'negative'
  resolved: boolean
}

class FieldNotesDB extends Dexie {
  notes!: Table<FieldNoteRecord, number>

  constructor() {
    super('JudgeSyncFieldNotes')
    this.version(1).stores({
      notes: '++id, eventSku, createdAt, reporterRole, priority, resolved',
    })
  }
}

const db = new FieldNotesDB()

export async function addFieldNote(note: Omit<FieldNoteRecord, 'id' | 'createdAt'>) {
  const record: FieldNoteRecord = {
    ...note,
    createdAt: Date.now(),
  }

  const id = await db.notes.add(record)
  return { ...record, id }
}

export async function listFieldNotes(eventSku: string) {
  const records = await db.notes
    .where('eventSku')
    .equals(eventSku)
    .toArray()

  return records.sort((a, b) => b.createdAt - a.createdAt)
}

export async function updateFieldNoteResolution(id: number, resolved: boolean) {
  await db.notes.update(id, { resolved })
}
