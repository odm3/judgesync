import { useState, useEffect } from 'react'
import { X, Save } from 'lucide-react'
import notebookRubric from '@/rubrics/engineering_notebook.json'

interface NotebookScoringModalProps {
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
    digitalNotebookUrl?: string
  }
  onSave: (data: {
    scores: Record<string, number>
    totalScore: number
    notes?: string
    gradeLevel?: 'ES' | 'MS' | 'HS' | 'University'
    judgeName?: string
    digitalNotebookUrl?: string
  }) => Promise<void>
}

export function NotebookScoringModal({
  isOpen,
  onClose,
  teamNumber,
  existingScore,
  onSave,
}: NotebookScoringModalProps) {
  const [scores, setScores] = useState<Record<string, number>>({})
  const [notes, setNotes] = useState('')
  const [gradeLevel, setGradeLevel] = useState<'ES' | 'MS' | 'HS' | 'University'>('HS')
  const [judgeName, setJudgeName] = useState('')
  const [digitalNotebookUrl, setDigitalNotebookUrl] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (existingScore) {
      setScores(existingScore.scores)
      setNotes(existingScore.notes || '')
      setGradeLevel(existingScore.gradeLevel || 'HS')
      setJudgeName(existingScore.judgeName || '')
      setDigitalNotebookUrl(existingScore.digitalNotebookUrl || '')
    } else {
      // Initialize scores to 0
      const initialScores: Record<string, number> = {}
      notebookRubric.categories.forEach((category) => {
        category.criteria.forEach((criterion) => {
          initialScores[criterion.id] = 0
        })
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
        digitalNotebookUrl: digitalNotebookUrl || undefined,
      })
      onClose()
    } catch (error) {
      console.error('Failed to save notebook score:', error)
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
            <h2 className="text-xl font-semibold text-foreground">Engineering Notebook Rubric</h2>
            <p className="text-sm text-muted-foreground">Team {teamNumber}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-6 p-6">
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
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-foreground mb-2">Digital Notebook URL</label>
              <input
                type="url"
                value={digitalNotebookUrl}
                onChange={(e) => setDigitalNotebookUrl(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-foreground"
              />
            </div>
          </div>

          {/* Rubric Categories */}
          {notebookRubric.categories.map((category) => (
            <div key={category.id} className="space-y-4 rounded-xl border border-white/10 bg-background/50 p-4">
              <h3 className="text-lg font-semibold text-foreground">{category.name}</h3>
              {category.criteria.map((criterion) => (
                <div key={criterion.id} className="space-y-3 rounded-lg border border-white/10 bg-card/50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h4 className="font-medium text-foreground">{criterion.name}</h4>
                      <p className="mt-1 text-xs text-muted-foreground">Max: {criterion.maxPoints} points</p>
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
          ))}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Additional observations or comments..."
              className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-foreground"
            />
          </div>

          {/* Total Score */}
          <div className="rounded-xl border border-primary/50 bg-primary/10 p-4">
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold text-foreground">Total Score</span>
              <span className="text-3xl font-bold text-primary">
                {calculateTotal().toFixed(2)} / {notebookRubric.totalMaxPoints}
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
