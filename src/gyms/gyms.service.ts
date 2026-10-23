import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { hashSecret } from '../common/utils/hash.util';
import { generateTempPassword } from '../common/utils/id-generator';
import { CreateGymDto, ResetGymManagerPasswordDto, UpdateGymDto, UpdateGymManagerDto, UpdateGymProfileDto } from './gyms.dto';

@Injectable()
export class GymsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Creates the Gym AND its primary branch-manager staff account in one
   * transaction — a gym with no login account is not a usable gym. Fixes
   * the original bug where GymsController POST /admin/gyms only ever
   * inserted a `gyms` row and left the branch with nothing to sign in
   * with. The manager's temporary password is generated server-side,
   * returned in plaintext exactly once in this response (and emailed),
   * and never stored or logged anywhere but as an argon2 hash from this
   * point on.
   */
  async create(dto: CreateGymDto, adminId: string) {
    const existingManager = await this.prisma.trainer.findUnique({ where: { email: dto.managerEmail } });
    if (existingManager) {
      throw new ConflictException('A staff account with this email already exists — use a different manager email.');
    }

    const temporaryPassword = generateTempPassword();
    const passwordHash = await hashSecret(temporaryPassword);

    const { gym, manager } = await this.prisma.$transaction(async (tx) => {
      const gym = await tx.gym.create({
        data: {
          name: dto.name,
          address: dto.address,
          location: dto.location,
          gymPhone: dto.gymPhone,
          ownerContact: dto.ownerContact,
          contactEmail: dto.contactEmail,
          memberLimit: dto.memberLimit,
          createdByAdminId: adminId,
        },
      });
      const manager = await tx.trainer.create({
        data: {
          gymId: gym.id,
          name: dto.managerName,
          email: dto.managerEmail,
          phone: dto.managerPhone,
          passwordHash,
          role: 'branch_manager',
          isPrimaryManager: true,
        },
      });
      return { gym, manager };
    });

    await this.auditLog.record({
      actorType: 'admin', actorId: adminId, action: 'gym.create', targetType: 'gym', targetId: gym.id,
      payload: { name: dto.name, memberLimit: dto.memberLimit, managerEmail: dto.managerEmail },
    });
    await this.auditLog.record({
      actorType: 'admin', actorId: adminId, action: 'trainer.create', targetType: 'trainer', targetId: manager.id,
      payload: { gymId: gym.id, role: 'branch_manager', auto_created_with_gym: true },
    });

    await this.notifications.notify({
      recipientType: 'trainer', recipientId: manager.id, type: 'credentials_delivery',
      title: 'Your UV Active Branch Portal login',
      body: `Your branch "${gym.name}" is ready. Log in at the Branch Portal with email ${manager.email} and the temporary password below — you'll be asked to set up two-factor authentication on first login.`,
      highlight: temporaryPassword,
      channel: 'email', recipientAddress: manager.email,
    });

    // Operation record to the admin side: every new branch is announced
    // in-app to all admins (and emailed), which also feeds the Emails
    // Sent counter on the Overview.
    await this.notifications.notifyAdmin({
      type: 'branch_created',
      title: 'New branch created',
      body: `Branch "${gym.name}" (${gym.location || gym.address || 'location not set'}) was created with member limit ${gym.memberLimit}. Branch manager: ${manager.name} <${manager.email}>. Credentials were emailed to the manager.`,
      data: { gymId: gym.id, managerId: manager.id },
      email: true,
    });

    return {
      gym,
      manager: {
        id: manager.id,
        name: manager.name,
        email: manager.email,
        // Present ONLY in this response — never re-fetchable afterward.
        temporaryPassword,
      },
    };
  }

  /** Own-branch profile for the Settings screen — same row as get(), just the branch's own view of it. */
  async getOwnProfile(gymId: string) {
    const gym = await this.get(gymId);
    const manager = await this.getManager(gymId);
    return { ...gym, manager };
  }

  async updateOwnProfile(gymId: string, dto: UpdateGymProfileDto) {
    await this.get(gymId);
    return this.prisma.gym.update({ where: { id: gymId }, data: dto });
  }

  /**
   * Everything the Dashboard screen needs in one call: member count vs
   * cap, today's sessions with enrollment, pending outgoing transfer
   * count, and the "needs reassignment" panel — which is only ever
   * populated (never just empty) so the frontend can decide whether to
   * render the panel at all, per design brief §3.2.
   */
  async getDashboard(gymId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const [gym, memberCount, sessionsToday, pendingTransferCount, needsReassignment, trainerCount, sensorCount] = await Promise.all([
      this.get(gymId),
      this.prisma.member.count({ where: { currentGymId: gymId } }),
      this.prisma.session.findMany({
        where: { gymId, scheduledAt: { gte: startOfDay, lte: endOfDay } },
        include: { trainer: { select: { id: true, name: true } }, _count: { select: { members: true } } },
        orderBy: { scheduledAt: 'asc' },
      }),
      // Admin-initiated requests addressed to THIS gym, awaiting this
      // branch's own accept/decline (see TransferRequestsService.
      // acceptByBranch) — this branch's own outgoing invites awaiting
      // member consent aren't an action item for the branch, so they're
      // deliberately excluded here.
      this.prisma.transferRequest.count({ where: { toGymId: gymId, status: 'pending', requestedByType: 'admin' } }),
      this.prisma.session.findMany({
        where: { gymId, needsReassignment: true },
        include: { trainer: { select: { id: true, name: true } } },
        orderBy: { scheduledAt: 'asc' },
      }),
      this.prisma.trainer.count({ where: { gymId, role: 'trainer', removedAt: null } }),
      this.prisma.sensor.count({ where: { gymId } }),
    ]);

    return {
      memberCount,
      memberLimit: gym.memberLimit,
      sessionsToday,
      pendingTransferCount,
      needsReassignment,
      trainerCount,
      sensorCount,
    };
  }

  // _count is NOT optional on this read: the Admin Panel's Gyms tab and
  // the Overview "Top Gyms by Member Volume" widget both render
  // gym._count.currentMembers / gym._count.trainers straight from this
  // endpoint. Omitting it made every one of those cells silently fall
  // back to `?? 0` — the "counts stuck at zero" bug. Trainers count is
  // filtered to role='trainer' + removedAt=null so branch-manager rows
  // (auto-created with the gym) and soft-deleted staff never inflate it.
  list() {
    return this.prisma.gym.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            currentMembers: true,
            trainers: { where: { role: 'trainer', removedAt: null } },
          },
        },
      },
    });
  }

  // Same _count contract as list() — the detail view must agree with the
  // list view (and getOwnProfile() builds on this method too).
  async get(id: string) {
    const gym = await this.prisma.gym.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            currentMembers: true,
            trainers: { where: { role: 'trainer', removedAt: null } },
          },
        },
      },
    });
    if (!gym) throw new NotFoundException('Gym not found.');
    return gym;
  }

  /** The gym's primary branch-manager account, for display on the admin Gym detail screen. */
  async getManager(id: string) {
    await this.get(id);
    const manager = await this.prisma.trainer.findFirst({
      where: { gymId: id, isPrimaryManager: true },
      select: { id: true, name: true, email: true, phone: true, status: true, totpEnabled: true, createdAt: true },
    });
    return manager;
  }

  /**
   * Admin-only edit of the manager's own name/email/phone — the branch
   * itself can't touch these (see UpdateGymProfileDto's comment; a
   * branch_manager can only change their own name via
   * TrainersService.updateManagerName). Email doubles as the Branch
   * Portal login, so a change here takes effect on the manager's next
   * login — existing sessions are left alone (unlike a password
   * change/reset, this isn't a credential compromise scenario).
   */
  async updateManager(id: string, dto: UpdateGymManagerDto, adminId: string) {
    await this.get(id);
    const manager = await this.prisma.trainer.findFirst({ where: { gymId: id, isPrimaryManager: true } });
    if (!manager) throw new NotFoundException('This gym has no primary manager account yet.');

    if (dto.email && dto.email !== manager.email) {
      const existing = await this.prisma.trainer.findUnique({ where: { email: dto.email } });
      if (existing) throw new ConflictException('A staff account with this email already exists.');
    }

    const updated = await this.prisma.trainer.update({
      where: { id: manager.id },
      data: { name: dto.name, email: dto.email, phone: dto.phone },
      select: { id: true, name: true, email: true, phone: true, status: true, totpEnabled: true, createdAt: true },
    });
    await this.auditLog.record({
      actorType: 'admin', actorId: adminId, action: 'trainer.update', targetType: 'trainer', targetId: manager.id,
      payload: { gymId: id, admin_edited_manager: true },
    });
    return updated;
  }

  async update(id: string, dto: UpdateGymDto, adminId: string) {
    await this.get(id);
    const gym = await this.prisma.gym.update({ where: { id }, data: dto });
    await this.auditLog.record({ actorType: 'admin', actorId: adminId, action: 'gym.update', targetType: 'gym', targetId: id, payload: { ...dto } });
    return gym;
  }

  /**
   * Issues a brand-new temporary password for the branch's primary
   * manager account (e.g. the original credentials email never
   * arrived, or the branch is locked out). Returns the plaintext once,
   * same handling as create(). Also revokes any existing sessions for
   * that account so an old, possibly-compromised password can't keep
   * working.
   */
  async resetManagerPassword(id: string, dto: ResetGymManagerPasswordDto, adminId: string) {
    await this.get(id);
    const manager = await this.prisma.trainer.findFirst({ where: { gymId: id, isPrimaryManager: true } });
    if (!manager) throw new NotFoundException('This gym has no primary manager account yet.');

    const temporaryPassword = dto.newPassword || generateTempPassword();
    const passwordHash = await hashSecret(temporaryPassword);
    await this.prisma.$transaction([
      this.prisma.trainer.update({ where: { id: manager.id }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({ where: { trainerId: manager.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);

    await this.auditLog.record({ actorType: 'admin', actorId: adminId, action: 'trainer.password_reset', targetType: 'trainer', targetId: manager.id, payload: { gymId: id, admin_initiated: true } });
    await this.notifications.notify({
      recipientType: 'trainer', recipientId: manager.id, type: 'credentials_delivery',
      title: 'Your UV Active Branch Portal password was reset',
      body: 'A UV Active admin reset your Branch Portal password. Use the temporary password below to sign in — you will be asked to set up two-factor authentication again.',
      highlight: temporaryPassword,
      channel: 'email', recipientAddress: manager.email,
    });

    return { managerId: manager.id, email: manager.email, temporaryPassword };
  }

  /**
   * The suspension cascade in one place: bump token_version so every
   * already-issued staff JWT for this gym fails GymActiveGuard on its
   * very next request, and flip status so new logins are blocked too.
   * Operation email goes to the admins (audit trail in their inbox, not
   * just the append-only log) — and to the branch's own contact email
   * when it has one, so the gym isn't blindsided by the lockout.
   */
  async suspend(id: string, adminId: string) {
    const gym = await this.get(id);
    const updated = await this.prisma.gym.update({
      where: { id },
      data: { status: 'suspended', tokenVersion: gym.tokenVersion + 1 },
    });
    await this.auditLog.record({ actorType: 'admin', actorId: adminId, action: 'gym.suspend', targetType: 'gym', targetId: id });
    await this.notifications.notifyAdmin({
      type: 'branch_suspended',
      title: 'Branch suspended',
      body: `Branch "${gym.name}" was SUSPENDED by an admin. All staff logins at this branch are blocked with immediate effect.`,
      data: { gymId: id },
      email: true,
    });
    if (gym.contactEmail) {
      await this.notifications.notify({
        recipientType: 'branch', recipientId: id, type: 'branch_suspended',
        title: 'Your branch has been suspended',
        body: `Your branch "${gym.name}" has been suspended by UV Active administration. Branch Portal access is disabled until it is reactivated. Contact UV Active support for details.`,
        channel: 'email', recipientAddress: gym.contactEmail,
      });
    }
    return updated;
  }

  async activate(id: string, adminId: string) {
    const gym = await this.get(id);
    const updated = await this.prisma.gym.update({
      where: { id },
      data: { status: 'active', tokenVersion: gym.tokenVersion + 1 },
    });
    await this.auditLog.record({ actorType: 'admin', actorId: adminId, action: 'gym.activate', targetType: 'gym', targetId: id });
    await this.notifications.notifyAdmin({
      type: 'branch_reactivated',
      title: 'Branch reactivated',
      body: `Branch "${gym.name}" was reactivated by an admin. Staff logins work again from now on.`,
      data: { gymId: id },
      email: true,
    });
    if (gym.contactEmail) {
      await this.notifications.notify({
        recipientType: 'branch', recipientId: id, type: 'branch_reactivated',
        title: 'Your branch has been reactivated',
        body: `Good news — your branch "${gym.name}" has been reactivated. Branch Portal access is restored.`,
        channel: 'email', recipientAddress: gym.contactEmail,
      });
    }
    return updated;
  }

  /**
   * Full cascade hard delete. There is deliberately no UI path to this
   * anymore (the admin Gyms tab only offers Suspend/Activate) — the
   * endpoint and this service method are kept for future/ops use. When
   * it DOES run it removes the gym row AND every piece of data
   * associated with it, in FK-safe order inside one transaction:
   *
   *   sensor readings → session members → sessions → transfer requests
   *   (both directions) → gym history → consents/PIN resets/refresh
   *   tokens → staff backup codes → password reset tokens →
   *   notifications → sensors → telemetry → members → trainers → gym.
   *
   * Members whose entire footprint is this gym are deleted outright.
   * Members that also exist at ANOTHER gym (other history / other
   * gyms' session bookings) are kept — deleting them would corrupt
   * that other gym's records — and are merely detached
   * (currentGymId=null). The audit record + admin email report the
   * exact per-table counts either way.
   */
  async remove(id: string, adminId: string) {
    const gym = await this.get(id);

    // Everyone whose data touches this gym, captured BEFORE we start
    // deleting — after the history/sessionMember wipes we could no
    // longer tell who was associated.
    const [assigned, historyRows, sessionMemberRows] = await Promise.all([
      this.prisma.member.findMany({ where: { currentGymId: id }, select: { id: true } }),
      this.prisma.memberGymHistory.findMany({ where: { gymId: id }, select: { memberId: true } }),
      this.prisma.sessionMember.findMany({ where: { session: { gymId: id } }, select: { memberId: true }, distinct: ['memberId'] }),
    ]);
    const associatedMemberIds = [
      ...new Set([
        ...assigned.map((m) => m.id),
        ...historyRows.map((h) => h.memberId),
        ...sessionMemberRows.map((r) => r.memberId),
      ]),
    ];

    const result = await this.prisma.$transaction(async (tx) => {
      const [sessionsCount, sensorsCount, trainersCount] = await Promise.all([
        tx.session.count({ where: { gymId: id } }),
        tx.sensor.count({ where: { gymId: id } }),
        tx.trainer.count({ where: { gymId: id } }),
      ]);

      // 1. Session tree — readings hang off session members, which hang
      //    off sessions; deepest-first so no FK blocks us.
      await tx.sensorReading.deleteMany({ where: { sessionMember: { session: { gymId: id } } } });
      await tx.sessionMember.deleteMany({ where: { session: { gymId: id } } });
      await tx.session.deleteMany({ where: { gymId: id } });

      // 2. Cross-gym links.
      await tx.transferRequest.deleteMany({ where: { OR: [{ fromGymId: id }, { toGymId: id }] } });
      await tx.memberGymHistory.deleteMany({ where: { gymId: id } });

      // 3. Classify the associated members NOW that this gym's rows are
      //    gone: anything still linking them is a footprint at another
      //    gym and means "keep + detach", no links left means "delete".
      const [remainingHistory, remainingSessions] = associatedMemberIds.length
        ? await Promise.all([
            tx.memberGymHistory.findMany({ where: { memberId: { in: associatedMemberIds } }, select: { memberId: true } }),
            tx.sessionMember.findMany({ where: { memberId: { in: associatedMemberIds } }, select: { memberId: true }, distinct: ['memberId'] }),
          ])
        : [[], []];
      const hasOtherGymFootprint = new Set([...remainingHistory, ...remainingSessions].map((r) => r.memberId));
      const memberIdsToDelete = associatedMemberIds.filter((mid) => !hasOtherGymFootprint.has(mid));
      const memberIdsToDetach = associatedMemberIds.filter((mid) => hasOtherGymFootprint.has(mid));

      if (memberIdsToDetach.length) {
        await tx.member.updateMany({ where: { id: { in: memberIdsToDetach }, currentGymId: id }, data: { currentGymId: null } });
      }

      const trainerIds = (await tx.trainer.findMany({ where: { gymId: id }, select: { id: true } })).map((t) => t.id);

      // 4. Member-owned rows for the members going away.
      if (memberIdsToDelete.length) {
        await tx.consent.deleteMany({ where: { memberId: { in: memberIdsToDelete } } });
        await tx.memberPinReset.deleteMany({ where: { memberId: { in: memberIdsToDelete } } });
        await tx.refreshToken.deleteMany({ where: { memberId: { in: memberIdsToDelete } } });
      }

      // 5. Staff-owned rows for every trainer/manager of this gym.
      if (trainerIds.length) {
        await tx.staffBackupCode.deleteMany({ where: { trainerId: { in: trainerIds } } });
        await tx.refreshToken.deleteMany({ where: { trainerId: { in: trainerIds } } });
        await tx.passwordResetToken.deleteMany({ where: { accountType: 'staff', accountId: { in: trainerIds } } });
      }

      // 6. Notification-center rows addressed to the branch, its staff,
      //    or the members being deleted (no FK, pure hygiene).
      await tx.notification.deleteMany({
        where: {
          OR: [
            { recipientType: 'branch', recipientId: id },
            ...(trainerIds.length ? [{ recipientType: 'trainer', recipientId: { in: trainerIds } }] : []),
            ...(memberIdsToDelete.length ? [{ recipientType: 'member', recipientId: { in: memberIdsToDelete } }] : []),
          ],
        },
      });

      // 7. Hardware, then people, then the gym row itself.
      await tx.sensor.deleteMany({ where: { gymId: id } });
      await tx.sensorTelemetry.deleteMany({ where: { gymId: id } });
      if (memberIdsToDelete.length) {
        await tx.member.deleteMany({ where: { id: { in: memberIdsToDelete } } });
      }
      await tx.trainer.deleteMany({ where: { gymId: id } });
      await tx.gym.delete({ where: { id } });

      return {
        sessionsDeleted: sessionsCount,
        sensorsDeleted: sensorsCount,
        trainersDeleted: trainersCount,
        membersDeleted: memberIdsToDelete.length,
        membersDetached: memberIdsToDetach.length,
      };
    });

    await this.auditLog.record({
      actorType: 'admin', actorId: adminId, action: 'gym.delete', targetType: 'gym', targetId: id,
      payload: { name: gym.name, hard_delete: true, ...result },
    });
    await this.notifications.notifyAdmin({
      type: 'branch_deleted',
      title: 'Branch deleted',
      body: `Branch "${gym.name}" was PERMANENTLY deleted by an admin. Removed: ${result.sessionsDeleted} session(s), ${result.membersDeleted} member record(s), ${result.trainersDeleted} staff account(s), ${result.sensorsDeleted} sensor(s).`
        + (result.membersDetached ? ` ${result.membersDetached} member(s) that also existed at other branches were kept but detached from this one.` : '')
        + ' This action cannot be undone.',
      data: { gymId: id, ...result },
      email: true,
    });
    return { ok: true, ...result };
  }
}
