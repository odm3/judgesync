/**
 * Judging System Type Definitions
 */

/**
 * Represents a team of judges who evaluate teams together
 */
export interface JudgeTeam {
  id: string; // UUID
  sessionId: string;
  name: string; // e.g., "Judge Team A", "Red Team"
  judgeDeviceIds: string[]; // Array of device IDs of judges on this team
  createdAt: number;
  updatedAt: number;
}

/**
 * Assignment of competition teams to judge teams
 */
export interface TeamAssignment {
  id: string; // UUID
  sessionId: string;
  judgeTeamId: string;
  teamNumber: string; // Competition team number (e.g., "123A")
  createdAt: number;
}

/**
 * Conflict of interest between a judge and a team
 */
export interface ConflictOfInterest {
  id: string; // UUID
  sessionId: string;
  judgeDeviceId: string;
  teamNumber: string;
  reason?: string | undefined; // Optional reason (e.g., "Team member parent", "School affiliation")
  createdBy: 'judge' | 'judge_advisor'; // Who entered this conflict
  createdAt: number;
}

/**
 * Rubric criterion for scoring
 */
export interface RubricCriterion {
  id: string;
  name: string;
  description: string;
  expertDescription: string; // 4-5 points
  proficientDescription: string; // 2-3 points
  emergingDescription: string; // 0-1 points
  maxPoints: number; // Usually 5
}

/**
 * Engineering Notebook score
 */
export interface NotebookScore {
  id: string; // UUID
  sessionId: string;
  judgeTeamId: string;
  teamNumber: string;
  scores: Record<string, number>; // criterionId -> score (0-5 in 0.25 increments)
  totalScore: number;
  notes?: string | undefined;
  gradeLevel?: 'ES' | 'MS' | 'HS' | 'University' | undefined;
  judgeName?: string | undefined; // Name of the judge who filled this out
  digitalNotebookUrl?: string | undefined; // Optional link to digital notebook
  createdAt: number;
  updatedAt: number;
  createdBy: string; // deviceId of submitter
}

/**
 * Team Interview score
 */
export interface InterviewScore {
  id: string; // UUID
  sessionId: string;
  judgeTeamId: string;
  teamNumber: string;
  scores: Record<string, number>; // criterionId -> score (0-5 in 0.25 increments)
  totalScore: number;
  notes?: string | undefined;
  gradeLevel?: 'ES' | 'MS' | 'HS' | 'University' | undefined;
  judgeName?: string | undefined; // Name of the judge who filled this out
  specialAttributes?: string | undefined; // Special attributes & overall impressions
  interviewDuration?: number | undefined; // Actual duration in seconds
  createdAt: number;
  updatedAt: number;
  createdBy: string; // deviceId of submitter
}

/**
 * Award nomination for a team
 */
export interface TeamNomination {
  id: string; // UUID
  sessionId: string;
  judgeTeamId: string;
  teamNumber: string;
  awardCategory: string; // e.g., "Design", "Innovate", "Build", "Create", "Amaze", "Judges", "Inspire"
  notes?: string | undefined;
  createdAt: number;
  createdBy: string; // deviceId of submitter
}

/**
 * Session-wide interview timer settings
 */
export interface TimerSettings {
  sessionId: string;
  defaultDuration: number; // Default duration in seconds (default: 600 = 10 minutes)
  currentDuration: number; // Current countdown in seconds
  isRunning: boolean;
  isPaused: boolean;
  startedAt?: number | undefined; // Timestamp when timer was started
  pausedAt?: number | undefined; // Timestamp when timer was paused
  updatedAt: number;
  updatedBy: string; // deviceId of who controls the timer
}

/**
 * Photo associated with a team during judging
 */
export interface TeamPhoto {
  id: string; // UUID
  sessionId: string;
  teamNumber: string;
  judgeTeamId?: string | undefined; // Optional: which judge team took this photo
  url: string; // URL to the photo (could be base64 data URL or uploaded URL)
  caption?: string | undefined;
  createdAt: number;
  createdBy: string; // deviceId
}

/**
 * Team judging notes (general observations)
 */
export interface TeamJudgingNote {
  id: string; // UUID
  sessionId: string;
  judgeTeamId: string;
  teamNumber: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  createdBy: string; // deviceId
}
