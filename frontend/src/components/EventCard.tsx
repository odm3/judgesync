import type { EventData } from '@/types/robotevents'
import { formatEventDateRange } from '@/services/robotevents'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/Card'
import { Button } from './ui/Button'
import { Calendar, MapPin, Trophy, Hash, ArrowRight, Users, Award } from 'lucide-react'

interface EventCardProps {
  event: EventData
  onBeginSetup: () => void
}

export function EventCard({ event, onBeginSetup }: EventCardProps) {
  const dateRange = formatEventDateRange(event.start, event.end)

  const fullAddress = [
    event.location.venue,
    event.location.city,
    event.location.region,
    event.location.country,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <Card className="w-full bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg text-white">{event.name}</CardTitle>
        <CardDescription className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Hash className="h-3.5 w-3.5" />
          <span className="font-mono text-primary">{event.sku}</span>
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 text-sm">
        {/* Program & Season */}
        <div className="flex items-start gap-2.5">
          <Trophy className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-muted-foreground">Program</p>
            <p className="text-sm text-foreground">{event.program.name}</p>
            <p className="text-xs text-muted-foreground">{event.season.name}</p>
          </div>
        </div>

        {/* Date */}
        <div className="flex items-start gap-2.5">
          <Calendar className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-muted-foreground">Date</p>
            <p className="text-sm text-foreground">{dateRange}</p>
          </div>
        </div>

        {/* Location */}
        <div className="flex items-start gap-2.5">
          <MapPin className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-muted-foreground">Location</p>
            <p className="text-sm text-foreground">{fullAddress}</p>
          </div>
        </div>

        {/* Teams */}
        <div className="flex items-start gap-2.5">
          <Users className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
          <div className="space-y-0.5 flex-1">
            <p className="text-xs font-medium text-muted-foreground">Teams</p>
            <p className="text-sm text-foreground">{event?.teams?.length} registered</p>
            {event?.teams?.length > 0 && (
              <div className="max-h-24 overflow-y-auto mt-1 space-y-0.5">
                {event.teams.slice(0, 10).map(team => (
                  <div key={team.id} className="text-xs text-muted-foreground">
                    <span className="font-mono text-primary">{team.number}</span>
                    {team.team_name && <span className="ml-1.5">{team.team_name}</span>}
                  </div>
                ))}
                {event?.teams?.length > 10 && (
                  <p className="text-xs text-muted-foreground italic">
                    +{event?.teams?.length - 10} more teams
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Awards */}
        {event?.awards?.length > 0 && (
          <div className="flex items-start gap-2.5">
            <Award className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
            <div className="space-y-0.5 flex-1">
              <p className="text-xs font-medium text-muted-foreground">Awards</p>
              <div className="space-y-0.5">
                {event.awards.map(award => (
                  <div key={award.id} className="text-xs text-foreground">
                    {award.title}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex flex-col gap-2 pt-3">
        <Button
          onClick={onBeginSetup}
          className="w-full h-10 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md"
        >
          Begin Setup
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          className="w-full h-10 border-border hover:bg-accent hover:text-accent-foreground rounded-md text-sm"
          onClick={() => window.open(`https://www.robotevents.com/robot-competitions/vex-robotics-competition/${event.sku}.html`, '_blank')}
        >
          View on RobotEvents
        </Button>
      </CardFooter>
    </Card>
  )
}
