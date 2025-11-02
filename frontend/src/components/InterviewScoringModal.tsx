import { useState, useEffect } from 'react'
import { X, Save, Clock } from 'lucide-react'
import interviewRubric from '@/rubrics/team_interview.json'
import { InterviewTimer } from './InterviewTimer'

interface InterviewScoringModalProps {
  isOpen: boolean
  onClose: () => void
  teamNumber: string
  judgeTeamId: string
  existingScore?: {
    id: string
    scores: Record<string, number>
    totalScore: number
    notes?: string
    gradeLevel?: 'ES' | 'MS' | 'HS' | 'University'
    judgeName?: string
    specialAttributes?: string
    interviewDuration?: number
  }
  onSave: (data: {
    scores: Record<string, number>
    totalScore: number
    notes?: string
    gradeLevel?: 'ES' | 'MS' | 'HS' | 'University'
    judgeName?: string
    specialAttributes?: string
    interviewDuration?: number
  }) => Promise<void>
}

export function InterviewScoringModal({
  isOpen,
  onClose,
  teamNumber,
  existingScore,
  onSave,
}: InterviewScoringModalProps) {
  const [scores, setScores] = useState<Record<string, number>>({})
  const [notes, setNotes] = useState('')
  const [gradeLevel, setGradeLevel] = useState<'ES' | 'MS' | 'HS' | 'University'>('HS')
  const [judgeName, setJudgeName] = useState('')
  const [specialAttributes, setSpecialAttributes] = useState('')
  const [showTimer, setShowTimer] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (existingScore) {
      setScores(existingScore.scores)
      setNotes(existingScore.notes || '')
      setGradeLevel(existingScore.gradeLevel || 'HS')
      setJudgeName(existingScore.judgeName || '')
      setSpecialAttributes(existingScore.specialAttributes || '')
    } else {
      // Initialize scores to 0
      const initialScores: Record<string, number> = {}
      interviewRubric.criteria.forEach((criterion) => {
        initialScores[criterion.id] = 0
      })
      setScores(initialScores)
    }
  }, [existingScore, isOpen])

  const calculateTotal = () => {
    return Object.values(scores).reduce((sum, score) => sum + score, 0)
  }

  const handleScoreChange = (criterionId: string, value: number) => {
    setScores((prev) => ({
      ...prev,
      [criterionId]: Math.max(0, Math.min(5, value)),
    }))
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await onSave({
        scores,
        totalScore: calculateTotal(),
        notes: notes || undefined,
        gradeLevel,
        judgeName: judgeName || undefined,
        specialAttributes: specialAttributes || undefined,
      })
      onClose()
    } catch (error) {
      console.error('Failed to save interview score:', error)
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-white/10 bg-card shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-card/95 px-6 py-4 backdrop-blur">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Team Interview Rubric</h2>
            <p className="text-sm text-muted-foreground">Team {teamNumber}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTimer(!showTimer)}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            >
              <Clock className="h-5 w-5" />
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-6 p-6">
          {/* Timer */}
          {showTimer && (
            <div className="rounded-xl border border-white/10 bg-background/50 p-4">
              <InterviewTimer />
            </div>
          )}

          {/* Metadata */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Grade Level</label>
              <select
                value={gradeLevel}
                onChange={(e) => setGradeLevel(e.target.value as any)}
                className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-foreground"
              >
                <option value="ES">Elementary School</option>
                <option value="MS">Middle School</option>
                <option value="HS">High School</option>
                <option value="University">University</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Judge Name</label>
              <input
                type="text"
                value={judgeName}
                onChange={(e) => setJudgeName(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-foreground"
              />
            </div>
          </div>

          {/* Rubric Criteria */}
          <div className="space-y-4">
            {interviewRubric.criteria.map((criterion) => (
              <div key={criterion.id} className="space-y-3 rounded-xl border border-white/10 bg-background/50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h4 className="font-medium text-foreground">{criterion.name}</h4>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {criterion.awardTags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="0"
                      max={criterion.maxPoints}
                      step="0.25"
                      value={scores[criterion.id] || 0}
                      onChange={(e) => handleScoreChange(criterion.id, parseFloat(e.target.value) || 0)}
                      className="w-20 rounded-lg border border-white/10 bg-background px-3 py-2 text-center font-mono text-foreground"
                    />
                    <input
                      type="range"
                      min="0"
                      max={criterion.maxPoints}
                      step="0.25"
                      value={scores[criterion.id] || 0}
                      onChange={(e) => handleScoreChange(criterion.id, parseFloat(e.target.value))}
                      className="w-32"
                    />
                  </div>
                </div>

                {/* Descriptions */}
                <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                  <div className="rounded border border-green-500/20 bg-green-500/5 p-2">
                    <p className="font-medium text-green-400">Expert (4-5 pts)</p>
                    <p className="mt-1 text-muted-foreground">{criterion.descriptions.expert}</p>
                  </div>
                  <div className="rounded border border-yellow-500/20 bg-yellow-500/5 p-2">
                    <p className="font-medium text-yellow-400">Proficient (2-3 pts)</p>
                    <p className="mt-1 text-muted-foreground">{criterion.descriptions.proficient}</p>
                  </div>
                  <div className="rounded border border-red-500/20 bg-red-500/5 p-2">
                    <p className="font-medium text-red-400">Emerging (0-1 pts)</p>
                    <p className="mt-1 text-muted-foreground">{criterion.descriptions.emerging}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Special Attributes & Overall Impressions */}
          <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
            <h3 className="mb-2 text-lg font-semibold text-foreground">
              {interviewRubric.specialAttributesSection.name}
            </h3>
            <p className="mb-3 text-sm text-muted-foreground">
              {interviewRubric.specialAttributesSection.prompt}
            </p>
            <textarea
              value={specialAttributes}
              onChange={(e) => setSpecialAttributes(e.target.value)}
              rows={3}
              placeholder="Describe special attributes, accomplishments, or exemplary efforts..."
              className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-foreground"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Additional Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Additional observations or comments..."
              className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-foreground"
            />
          </div>

          {/* Total Score */}
          <div className="rounded-xl border border-primary/50 bg-primary/10 p-4">
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold text-foreground">Total Score</span>
              <span className="text-3xl font-bold text-primary">
                {calculateTotal().toFixed(2)} / {interviewRubric.totalMaxPoints}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex gap-3 border-t border-white/10 bg-card/95 px-6 py-4 backdrop-blur">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-white/10 px-4 py-2.5 font-medium text-foreground hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : (
              <>
                <Save className="mr-2 inline-block h-4 w-4" />
                Save Score
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
