export type GymStatus = "active" | "suspended" | "deleted";
export type MemberStatus = "active" | "suspended" | "pending_transfer";
export type Sex = "male" | "female" | "other";
export type TrainerStatus = "active" | "suspended";
export type StaffRole = "trainer" | "branch_manager";
export type SessionStatus = "scheduled" | "in_progress" | "completed" | "cancelled";
export type AdminRole = "super_admin" | "support";
export type AttendanceStatus = "enrolled" | "checked_in" | "no_show" | "cancelled";
export type TransferStatus = "pending" | "accepted" | "declined" | "expired";

export interface Gym {
  id: string;
  name: string;
  address?: string | null;
  location?: string | null;
  gymPhone?: string | null;
  ownerContact?: string | null;
  contactEmail?: string | null;
  status: GymStatus;
  memberLimit: number;
  tokenVersion: number;
  createdByAdminId?: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { currentMembers: number; trainers: number };
}

export interface MemberGymHistoryEntry {
  id: string;
  gymId: string;
  gym?: { id: string; name: string };
  joinedAt: string;
  leftAt?: string | null;
  releasedByType?: string | null;
  releasedById?: string | null;
  reason?: string | null;
}

export interface SessionMemberResult {
  id: string;
  sessionId: string;
  session?: Session;
  memberId: string;
  member?: { id: string; name: string; memberCode: string };
  enrolledAt: string;
  enrolledBy: string;
  attendance: AttendanceStatus;
  avgHr?: number | null;
  maxHr?: number | null;
  calories?: number | null;
  score?: number | null;
  // Rich post-workout results (spec §7), when recorded.
  sweatPoints?: number | null;
  recoveryPoints?: number | null;
  recoveryGrade?: string | null;
  epocCalories?: number | null;
  epocHours?: number | null;
  avgPctMhr?: number | null;
  maxPctMhr?: number | null;
  finalRank?: number | null;
  // Interval/target-zone consistency % — present when the trainer ran
  // target-zone intervals for this session (null otherwise).
  consistencyPct?: number | null;
}

// Per-second HR tick for the leaderboard -> member drill-down graph.
// `zone` comes from the cloud API (computed with the same formula
// engine the Trainer App uses) so the graph can be colored by zone.
export interface HrTick {
  ts: number;
  bpm: number;
  zone?: number | null;
  pctMhr?: number | null;
}

export interface Member {
  id: string;
  memberCode: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  dob?: string | null;
  sex?: Sex | null;
  ageYears?: number | null;
  heightCm?: number | null;
  weightKg?: number | null;
  restingHr?: number | null;
  photoUrl?: string | null;
  status: MemberStatus;
  currentGymId?: string | null;
  currentGym?: { id: string; name: string } | null;
  isAnonymized: boolean;
  anonymizedAt?: string | null;
  createdAt: string;
  gymHistory?: MemberGymHistoryEntry[];
  sessionMembers?: SessionMemberResult[];
  // Present ONLY on the immediate response to create / reset-pin —
  // the plaintext PIN shown once so staff can hand it to the member.
  pin?: string;
}

export interface Trainer {
  id: string;
  gymId: string;
  gym?: { id: string; name: string };
  name: string;
  email: string;
  phone?: string | null;
  photoUrl?: string | null;
  role: StaffRole;
  status: TrainerStatus;
  createdAt: string;
  sessions?: (Session & { _count?: { members: number } })[];
}

export interface Session {
  id: string;
  gymId: string;
  gym?: { id: string; name: string };
  trainerId: string;
  trainer?: { id: string; name: string };
  name: string;
  capacity: number;
  status: SessionStatus;
  startedAt?: string | null;
  endedAt?: string | null;
  scheduledAt?: string | null;
  cancelledReason?: string | null;
  needsReassignment: boolean;
  createdAt: string;
  members?: SessionMemberResult[];
}

export interface AdminAccount {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  totpEnabled: boolean;
  createdAt: string;
}

// Enriched audit entry — the backend resolves display names for actor,
// target, and branch so the UI can answer "which branch, which operation,
// by whom, to whom" without per-row lookups.
export interface AuditLogEntry {
  id: string;
  actorType: "member" | "staff" | "admin" | "system";
  actorId?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  targetName?: string | null;
  targetLabel?: string | null;
  gymId?: string | null;
  gymName?: string | null;
  payload?: Record<string, unknown> | null;
  ip?: string | null;
  createdAt: string;
}

export interface GymOption {
  id: string;
  name: string;
}

export interface TransferRequest {
  id: string;
  memberId: string;
  member?: { id: string; name: string; memberCode: string };
  fromGymId?: string | null;
  toGymId: string;
  toGym?: { id: string; name: string };
  requestedByType: "branch" | "admin";
  requestedById?: string | null;
  status: TransferStatus;
  createdAt: string;
  respondedAt?: string | null;
  expiresAt: string;
}

export interface PageMeta {
  skip: number;
  take: number;
  total: number;
}
