-- Member-scoped history reads (Member App GET /member/sessions and
-- /member/sessions/:id, Trainer App + Branch Portal athlete profile) all
-- filter session_members by member_id. The existing UNIQUE(session_id,
-- member_id) only serves session-first lookups, so these were full scans.
CREATE INDEX IF NOT EXISTS "session_members_member_id_idx" ON "session_members"("member_id");
