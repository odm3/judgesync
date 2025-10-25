import Dexie, { type Table } from 'dexie'

export interface TeamImageRecord {
  id?: number
  eventSku: string
  teamNumber: string
  createdAt: number
  blob: Blob
  mimeType: string
  name: string
}

class TeamImagesDB extends Dexie {
  images!: Table<TeamImageRecord, number>

  constructor() {
    super('JudgeSyncTeamImages')
    this.version(1).stores({
      images: '++id, eventSku, teamNumber, createdAt, [eventSku+teamNumber]',
    })
  }
}

const db = new TeamImagesDB()

export async function addTeamImage(eventSku: string, teamNumber: string, file: File) {
  const record: TeamImageRecord = {
    eventSku,
    teamNumber,
    createdAt: Date.now(),
    blob: file,
    mimeType: file.type || 'image/jpeg',
    name: file.name || `${teamNumber}-${Date.now()}`,
  }

  const id = await db.images.add(record)
  return { ...record, id }
}

export async function listTeamImages(eventSku: string, teamNumber: string) {
  const images = await db.images
    .where('[eventSku+teamNumber]')
    .equals([eventSku, teamNumber])
    .sortBy('createdAt')

  return images.reverse()
}

export async function deleteTeamImage(id: number) {
  await db.images.delete(id)
}
