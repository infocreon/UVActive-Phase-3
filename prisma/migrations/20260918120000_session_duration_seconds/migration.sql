-- Session duration was never persisted anywhere in the cloud: the
-- Trainer App measured it locally (SQLite sessions.duration_seconds) but
-- the sync payload's EndSessionDto had no field for it and the Session
-- row only carried started_at/ended_at. Every other client (Branch
-- Portal, Admin Panel, Member App) therefore had no duration to display
-- for an app-run session. Nullable/additive, same shape as
-- 20260908090000_session_member_consistency_pct — existing rows and
-- sessions completed before this migration stay valid with a null
-- value, and SessionsService.end() falls back to
-- `ended_at - started_at` when a client doesn't send one.
ALTER TABLE "sessions"
  ADD COLUMN "duration_seconds" INTEGER;
