import { useEffect, useState } from 'react'
import { useParams, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { fetchEventBySku } from '@/services/robotevents'
import type { EventData } from '@/types/robotevents'
import { Tabs } from '@/components/ui/Tabs'
import { TeamsPage } from './TeamsPage'
import { ManagePage } from './ManagePage'
import { JudgeAdminPage } from './JudgeAdminPage'
import { Spinner } from '@/components/ui/Spinner'
import {
  AlertCircle,
  Users,
  Cloud,
  ExternalLink,
  BookOpen,
  Award as AwardIcon,
  CalendarClock,
  ArrowLeft,
  Trophy,
  Shield,
} from 'lucide-react'
import { AwardsPage } from './AwardsPage'
import { TeamDetailsPage } from './TeamDetailsPage'
import { EventSchedulePage } from './EventSchedulePage'
import { EventSkillsPage } from './EventSkillsPage'
import { useJudgingSession } from '@/context/JudgingSessionContext'

export function EventPage() {
  const { sku } = useParams<{ sku: string }>()
  const navigate = useNavigate()
  const { isJudgeAdvisor } = useJudgingSession()
  const [event, setEvent] = useState<EventData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sku) return

    const loadEvent = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const eventData = await fetchEventBySku(sku)
        setEvent(eventData)
      } catch (err: any) {
        setError(err.message || 'Failed to load event')
      } finally {
        setIsLoading(false)
      }
    }

    loadEvent()
  }, [sku])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <Spinner size="lg" />
        <p className="text-sm text-gray-400 mt-4">Loading event...</p>
      </div>
    )
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <div className="bg-red-900/15 border border-red-500/40 rounded-xl p-5 shadow-lg">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <h3 className="text-sm font-semibold text-foreground mt-2">Error</h3>
            <p className="text-sm text-muted-foreground mt-1">{error || 'Event not found'}</p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="w-full px-4 py-2 bg-secondary hover:bg-secondary/80 text-foreground font-medium rounded-xl border border-white/10 transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    )
  }

  const tabs = [
    {
      label: 'Matches',
      path: `/${sku}/schedule`,
      icon: <CalendarClock className="h-4 w-4" />,
      matchPaths: [`/${sku}/schedule`],
    },
    {
      label: 'Skills',
      path: `/${sku}/skills`,
      icon: <Trophy className="h-4 w-4" />,
      matchPaths: [`/${sku}/skills`],
    },
    {
      label: 'Teams',
      path: `/${sku}/teams`,
      icon: <Users className="h-4 w-4" />,
      matchPaths: [`/${sku}/teams`, `/${sku}/team`],
    },
    {
      label: 'Awards',
      path: `/${sku}/awards`,
      icon: <AwardIcon className="h-4 w-4" />,
    },
    ...(isJudgeAdvisor
      ? [
          {
            label: 'Judge Admin',
            path: `/${sku}/judge-admin`,
            icon: <Shield className="h-4 w-4" />,
          },
        ]
      : []),
    {
      label: 'Manage',
      path: `/${sku}/manage`,
      icon: <Cloud className="h-4 w-4" />,
    },
    {
      label: 'RobotEvents',
      path: `https://www.robotevents.com/robot-competitions/vex-robotics-competition/${event.sku}.html`,
      icon: <ExternalLink className="h-4 w-4" />,
      external: true,
    },
  ]

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen flex-col">
        {/* Header */}
        <header className="px-4 pt-6">
          <div className="rounded-2xl border border-white/5 bg-card/90 px-5 py-4 shadow-lg shadow-black/40 backdrop-blur">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/')}
                className="group flex flex-1 items-center gap-3 text-left transition-opacity hover:opacity-80"
              >
                <ArrowLeft className="h-5 w-5 flex-none text-muted-foreground transition-transform group-hover:-translate-x-0.5" />
                <div className="flex-1 space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground/80">Event</p>
                  <h1 className="text-lg font-semibold leading-snug text-foreground">
                    {event.name}
                  </h1>
                  <p className="font-mono text-sm text-primary">{event.sku}</p>
                </div>
              </button>
              <button
                onClick={() =>
                  window.open(
                    'https://kb.roboticseducation.org/hc/en-us/article_attachments/34374267939223',
                    '_blank'
                  )
                }
                className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-xl border border-white/10 bg-card/80 text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground"
                aria-label="Open RECF Judging Guide"
              >
                <BookOpen className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-hidden px-4 pb-24 pt-6">
          <div className="h-full">
            <Routes>
              <Route index element={<Navigate to="schedule" replace />} />
              <Route path="schedule" element={<EventSchedulePage event={event} />} />
              <Route path="skills" element={<EventSkillsPage event={event} />} />
              <Route path="teams" element={<TeamsPage event={event} />} />
              <Route path="team/:teamNumber/*" element={<TeamDetailsPage event={event} />} />
              <Route path="awards" element={<AwardsPage event={event} />} />
              <Route path="judge-admin" element={<JudgeAdminPage event={event} />} />
              <Route path="manage" element={<ManagePage event={event} />} />
              <Route path="*" element={<Navigate to="schedule" replace />} />
            </Routes>
          </div>
        </main>
      </div>

      {/* Tabs - Fixed at Bottom */}
      <div className="fixed inset-x-0 bottom-0 z-50">
        <Tabs tabs={tabs} />
      </div>
    </div>
  )
}
