import { Injectable } from '@nestjs/common';
import { Prisma, ActorType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  actorType: ActorType;
  actorId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  payload?: Record<string, unknown>;
  ip?: string;
}

/**
 * One enriched audit row as returned by list(): the raw append-only
 * record plus everything the Admin UI needs to answer "WHICH branch,
 * WHAT operation, done BY whom, TO whom" without a second lookup per
 * row. Resolved fields are additive — the raw columns are unchanged.
 */
export interface EnrichedAuditEntry {
  id: string;
  actorType: ActorType;
  actorId: string | null;
  /** Resolved display name of who performed the action (admin/staff/member). */
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  /** Resolved display label of what the action was performed ON. */
  targetName: string | null;
  /** Secondary label, e.g. the member code for a member target. */
  targetLabel: string | null;
  /** The branch this entry belongs to (explicit target, payload gymId/from/to, or the staff actor's own gym). */
  gymId: string | null;
  gymName: string | null;
  payload: Record<string, unknown> | null;
  ip: string | null;
  createdAt: Date;
}

/**
 * Every mutating action platform-wide gets written here — not just
 * Admin-initiated ones (Cloud API spec §3.9). Called explicitly from
 * each service right after its own mutation succeeds, rather than via a
 * generic interceptor, so the before/after diff that actually matters
 * (e.g. "released from gym X, reason Y") is meaningful instead of a raw
 * request/response dump.
 *
 * DB-level grants restricting this table to INSERT+SELECT for the app's
 * runtime role (no UPDATE/DELETE) are configured in infra — see
 * README's "Least-privilege DB role" section — so even a compromised
 * app-layer bug can't rewrite history.
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorType: entry.actorType,
        actorId: entry.actorId,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        payload: entry.payload as any,
        ip: entry.ip,
      },
    });
  }

  /**
   * Read-side of the audit trail. Resolution strategy: pull the page of
   * raw rows first, collect every id they reference (actors, targets,
   * payload gym/member refs), then batch-resolve names in four queries.
   * That keeps enrichment O(page) instead of loading the whole
   * members/trainers tables on every request.
   */
  async list(params: {
    targetType?: string;
    actorId?: string;
    action?: string;
    gymId?: string;
    take?: number;
    skip?: number;
  }) {
    const { targetType, actorId, action, gymId, take = 50, skip = 0 } = params;

    const where: Prisma.AuditLogWhereInput = {
      ...(targetType ? { targetType } : {}),
      ...(actorId ? { actorId } : {}),
      // Substring match so "gym." catches create/suspend/activate/delete
      // and "member." catches register/release/anonymize/delete etc.
      ...(action ? { action: { contains: action } } : {}),
      // Branch scoping. A gym id can appear in three places: as the
      // target itself (gym.* actions), inside the payload
      // (gymId/toGymId/fromGymId on trainer/member/transfer actions), so
      // the filter has to cover all of them — filtering on targetId
      // alone would hide e.g. "trainer suspended at branch X".
      ...(gymId
        ? {
            OR: [
              { targetType: 'gym', targetId: gymId },
              { payload: { path: ['gymId'], equals: gymId } },
              { payload: { path: ['toGymId'], equals: gymId } },
              { payload: { path: ['fromGymId'], equals: gymId } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip });
    const total = await this.prisma.auditLog.count({ where });

    // ── Collect every id this page references ──────────────────────────
    const idSet = new Set<string>();
    for (const r of rows) {
      if (r.actorId) idSet.add(r.actorId);
      if (r.targetId) idSet.add(r.targetId);
      const p = (r.payload ?? {}) as Record<string, unknown>;
      for (const key of ['memberId', 'gymId', 'toGymId', 'fromGymId', 'trainerId']) {
        const v = p[key];
        if (typeof v === 'string') idSet.add(v);
      }
    }
    const ids = [...idSet];

    const [gyms, trainers, admins, members] = await Promise.all([
      this.prisma.gym.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
      this.prisma.trainer.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true, gymId: true } }),
      this.prisma.admin.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } }),
      this.prisma.member.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, memberCode: true } }),
    ]);

    const gymMap = new Map(gyms.map((g) => [g.id, g]));
    const trainerMap = new Map(trainers.map((t) => [t.id, t]));
    const adminMap = new Map(admins.map((a) => [a.id, a]));
    const memberMap = new Map(members.map((m) => [m.id, m]));

    const data: EnrichedAuditEntry[] = rows.map((r) => {
      const payload = (r.payload ?? null) as Record<string, unknown> | null;

      // ── WHO did it ──────────────────────────────────────────────────
      let actorName: string | null = null;
      let actorEmail: string | null = null;
      const actorTrainer = r.actorType === 'staff' && r.actorId ? trainerMap.get(r.actorId) : undefined;
      const actorAdmin = r.actorType === 'admin' && r.actorId ? adminMap.get(r.actorId) : undefined;
      const actorMember = r.actorType === 'member' && r.actorId ? memberMap.get(r.actorId) : undefined;
      if (actorTrainer) {
        actorName = actorTrainer.name;
        actorEmail = actorTrainer.email;
      } else if (actorAdmin) {
        actorName = actorAdmin.name;
        actorEmail = actorAdmin.email;
      } else if (actorMember) {
        actorName = actorMember.name;
      }

      // ── WHICH branch ────────────────────────────────────────────────
      // Priority: the gym is the explicit target → payload's explicit
      // gym reference → the staff actor's own branch (trainer.create,
      // sensor.*, etc. carry gymId in the payload; anything else the
      // actor IS the branch's staff).
      const payloadGymId =
        [payload?.gymId, payload?.toGymId, payload?.fromGymId].find((v): v is string => typeof v === 'string') ?? null;
      const gymId =
        (r.targetType === 'gym' ? r.targetId : null) ?? payloadGymId ?? actorTrainer?.gymId ?? null;
      const gym = gymId ? gymMap.get(gymId) : undefined;

      // ── TO WHOM (what the action was performed on) ──────────────────
      const targetTrainer = r.targetType === 'trainer' && r.targetId ? trainerMap.get(r.targetId) : undefined;
      const targetMember =
        r.targetType === 'member' && r.targetId
          ? memberMap.get(r.targetId)
          : r.targetType === 'transfer_request' && typeof payload?.memberId === 'string'
            ? memberMap.get(payload.memberId)
            : undefined;
      const targetAdmin = r.targetType === 'admin' && r.targetId ? adminMap.get(r.targetId) : undefined;
      const targetGym = r.targetType === 'gym' && r.targetId ? gymMap.get(r.targetId) : undefined;

      const targetName =
        targetGym?.name ??
        targetTrainer?.name ??
        targetMember?.name ??
        targetAdmin?.name ??
        // Fallback: deleted rows (hard member delete) can't resolve —
        // registration-time snapshots in the payload keep working.
        (typeof payload?.name === 'string' ? payload.name : null) ??
        (typeof payload?.memberCode === 'string' ? payload.memberCode : null);

      const targetLabel =
        targetMember?.memberCode ??
        targetTrainer?.email ??
        targetAdmin?.email ??
        (typeof payload?.memberCode === 'string' && targetMember?.memberCode !== payload.memberCode
          ? payload.memberCode
          : null);

      return {
        id: r.id,
        actorType: r.actorType,
        actorId: r.actorId,
        actorName,
        actorEmail,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        targetName,
        targetLabel,
        gymId,
        gymName: gym?.name ?? null,
        payload,
        ip: r.ip,
        createdAt: r.createdAt,
      };
    });

    return { data, meta: { skip, take, total } };
  }
}
