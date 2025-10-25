/**
 * RobotEvents API type definitions
 */

export interface Team {
  id: number
  number: string
  team_name: string
  organization: string
  registered: boolean
}

export interface Award {
  id: number
  title: string
  qualifies: string[]
  designation?: string | null
  classification?: string | null
  teamWinners: {
    teamNumber: string
    teamName?: string
  }[]
  individualWinners: string[]
}

export interface Division {
  id: number
  name: string
  code?: string | null
}

export interface MatchAllianceTeam {
  id?: number
  number?: string
  sitting?: boolean
}

export interface MatchAlliance {
  color: 'red' | 'blue'
  score: number
  teams: MatchAllianceTeam[]
}

export interface SkillRun {
  id: number
  team: {
    id: number
    number: string
  }
  division?: Division | null
  attempts: number
  score: number
  rank?: number
  type: 'driver' | 'programming' | 'package_delivery_time' | string
  created?: string
}

export interface EventMatch {
  id: number
  round: number
  instance: number
  matchnum: number
  shortName: string
  name: string
  scheduled?: string
  started?: string
  field?: string
  scored: boolean
  division?: Division | null
  alliances: MatchAlliance[]
}

export interface EventData {
  id: number
  sku: string
  name: string
  start: string
  end: string
  season: {
    id: number
    name: string
  }
  program: {
    id: number
    name: string
    code: string
  }
  location: {
    venue: string
    address_1: string
    address_2?: string
    city: string
    region: string
    postcode: string
    country: string
  }
  teams: Team[]
  awards: Award[]
  divisions: Division[]
  matches: EventMatch[]
  skills: SkillRun[]
  awardsFinalized?: boolean
}

export class RobotEventsError extends Error {
  code?: string

  constructor(message: string, code?: string) {
    super(message)
    this.name = 'RobotEventsError'
    this.code = code
  }
}
