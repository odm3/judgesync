import { Client } from 'robotevents'
import type { EventData, EventMatch, Division, MatchAlliance, SkillRun } from '@/types/robotevents'
import { RobotEventsError } from '@/types/robotevents'

// Initialize authentication with token from environment
const ROBOTEVENTS_TOKEN = import.meta.env.VITE_ROBOTEVENTS_TOKEN || ''

const client = Client({
  authorization: { token: "" + ROBOTEVENTS_TOKEN },
});

/**
 * Validates if a string matches the RE-XXX-XX-XXXX format
 * Examples: RE-V5RC-25-0790, RE-VIQRC-25-1546
 */
export function isValidEventSku(sku: string): boolean {
  const skuPattern = /^RE-[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+$/i
  return skuPattern.test(sku.trim())
}

/**
 * Formats a SKU to uppercase with proper spacing
 */
export function formatEventSku(sku: string): string {
  return sku.trim().toUpperCase()
}

/**
 * Fetches event data from RobotEvents API by SKU
 */
export async function fetchEventBySku(sku: string): Promise<EventData> {
  const formattedSku = formatEventSku(sku)

  if (!isValidEventSku(formattedSku)) {
    throw new RobotEventsError(
      'Invalid event SKU format. Expected format: RE-XXXXX-XX-XXXX (e.g., RE-V5RC-25-0790)',
      'INVALID_SKU'
    )
  }

  if (!ROBOTEVENTS_TOKEN) {
    throw new RobotEventsError(
      'RobotEvents API token not configured',
      'NO_TOKEN'
    )
  }

  try {
    // Search for event by SKU
    const eventResults = await client.events.search({
      "sku[]": [formattedSku],
    });

    if (!eventResults || !eventResults.data || eventResults.data.length === 0) {
      throw new RobotEventsError(
        `No event found with SKU: ${formattedSku}`,
        'EVENT_NOT_FOUND'
      )
    }

    const event = eventResults.data[0];

    let rawDivisions: any[] = event.divisions || []
    if (!rawDivisions?.length) {
      try {
        const detailedEvent = await client.events.get(event.id)
        if (detailedEvent.data) {
          rawDivisions = detailedEvent.data.divisions || []
        }
      } catch (divisionError) {
        console.error('Failed to load detailed event data for divisions', divisionError)
      }
    }

    // Fetch teams for the event
    const teamsResponse = await event.teams();
    const teams = (teamsResponse.data || []).map((team: any) => ({
      id: team.id,
      number: team.number,
      team_name: team.team_name || '',
      organization: team.organization || '',
      registered: team.registered || false,
    }));

    // Fetch awards for the event
    const awardsResponse = await event.awards();
    const awards = (awardsResponse.data || []).map((award: any) => ({
      id: award.id,
      title: award.title || '',
      qualifies: award.qualifications || [],
      designation: award.designation ?? null,
      classification: award.classification ?? null,
      teamWinners: (award.teamWinners || []).map((winner: any) => ({
        teamNumber: winner.team?.name ?? winner.team?.code ?? 'Unknown',
        teamName: winner.team?.team_name ?? '',
      })),
      individualWinners: award.individualWinners || [],
    }));

    const divisions: Division[] = (rawDivisions || []).map((division: any) => ({
      id: division.id,
      name: division.name,
      code: division.code ?? null,
    }));

    const matches: EventMatch[] = []
    for (const division of divisions) {
      try {
        const divisionMatches = await event.matches(division.id)
        if (divisionMatches.data) {
          matches.push(
            ...divisionMatches.data.map((match: any) => {
              const alliances: MatchAlliance[] = (match.alliances || []).map(
                (alliance: any) => ({
                  color: alliance.color,
                  score: alliance.score ?? 0,
                  teams: (alliance.teams || [])
                    .filter((teamEntry: any) => !teamEntry.sitting)
                    .map((teamEntry: any) => ({
                      id: teamEntry.team?.id,
                      number: teamEntry.team?.name ?? teamEntry.team?.code ?? '',
                      sitting: !!teamEntry.sitting,
                    })),
                })
              )

              return {
                id: match.id,
                round: match.round,
                instance: match.instance,
                matchnum: match.matchnum,
                shortName: typeof match.shortName === 'function'
                  ? match.shortName()
                  : match.name,
                name: match.name,
                scheduled: match.scheduled,
                started: match.started,
                field: match.field,
                scored: match.scored ?? false,
                division: match.division
                  ? {
                      id: match.division.id,
                      name: match.division.name,
                      code: match.division.code ?? null,
                    }
                  : division,
                alliances,
              } satisfies EventMatch
            })
          )
        }
      } catch (matchError) {
        console.error(`Failed to load matches for division ${division.id}`, matchError)
      }
    }

    let skills: SkillRun[] = []
    try {
      const skillsResponse = await event.skills()
      if (skillsResponse.data) {
        skills = skillsResponse.data.map((skill: any) => ({
          id: skill.id,
          team: {
            id: skill.team?.id ?? 0,
            number: skill.team?.name ?? skill.team?.code ?? 'Unknown',
          },
          division: skill.division
            ? {
                id: skill.division.id,
                name: skill.division.name,
                code: skill.division.code ?? null,
              }
            : null,
          attempts: skill.attempts ?? 0,
          score: skill.score ?? 0,
          rank: skill.rank ?? undefined,
          type: skill.type ?? 'driver',
          created: skill.created,
        }))
      }
    } catch (skillsError) {
      console.error('Failed to load skills data', skillsError)
    }

    // Transform to our EventData interface
    const eventData: EventData = {
      id: event.id,
      sku: event.sku,
      name: event.name,
      start: event.start || '',
      end: event.end || '',
      season: {
        id: event.season.id,
        name: event.season.name,
      },
      program: {
        id: event.program.id,
        name: event.program.name,
        code: event.program.code || '',
      },
      location: {
        venue: event.location?.venue || '',
        address_1: event.location?.address_1 || '',
        address_2: event.location?.address_2,
        city: event.location?.city || '',
        region: event.location?.region || '',
        postcode: event.location?.postcode || '',
        country: event.location?.country || '',
      },
      teams,
      awards,
      divisions,
      matches,
      skills,
      awardsFinalized: event.awards_finalized ?? false,
    }

    return eventData
  } catch (error) {
    if (error instanceof RobotEventsError) {
      throw error
    }

    // Handle network errors
    if (error instanceof Error) {
      if (error.message.includes('401') || error.message.includes('unauthorized')) {
        throw new RobotEventsError(
          'Invalid RobotEvents API token',
          'UNAUTHORIZED'
        )
      }
      if (error.message.includes('network') || error.message.includes('fetch')) {
        throw new RobotEventsError(
          'Network error. Please check your connection and try again.',
          'NETWORK_ERROR'
        )
      }
      throw new RobotEventsError(
        `Failed to fetch event: ${error.message}`,
        'FETCH_ERROR'
      )
    }

    throw new RobotEventsError(
      'An unexpected error occurred',
      'UNKNOWN_ERROR'
    )
  }
}

/**
 * Formats a date string for display
 */
export function formatEventDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Formats event date range
 */
export function formatEventDateRange(start: string, end: string): string {
  const startFormatted = formatEventDate(start)
  const endDate = new Date(end)

  // If same day, only show one date
  if (start === end) {
    return startFormatted
  }

  // Show abbreviated end date
  const endFormatted = endDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return `${startFormatted} - ${endFormatted}`
}
