import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { BulkCreateSensorsDto, CreateSensorDto, UpdateSensorDto } from './sensors.dto';

@Injectable()
export class SensorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  listForGym(gymId: string) {
    return this.prisma.sensor.findMany({ where: { gymId }, orderBy: { createdAt: 'asc' } });
  }

  // The number of registered sensors IS the session-enrollment cap
  // (spec: "already added sensors slots if 6 they can add only 6
  // members ... above that not permit") — sessions.service reads this
  // directly when validating capacity.
  countForGym(gymId: string) {
    return this.prisma.sensor.count({ where: { gymId } });
  }

  async create(gymId: string, dto: CreateSensorDto, actorTrainerId: string) {
    const existing = await this.prisma.sensor.findFirst({ where: { gymId, sensorId: dto.sensorId } });
    if (existing) throw new ConflictException('A sensor with this Sensor ID is already registered at your gym.');

    const sensor = await this.prisma.sensor.create({ data: { gymId, name: dto.name, sensorId: dto.sensorId, note: dto.note } });
    await this.auditLog.record({ actorType: 'staff', actorId: actorTrainerId, action: 'sensor.create', targetType: 'sensor', targetId: sensor.id, payload: { gymId, sensorId: dto.sensorId } });
    return sensor;
  }

  async update(id: string, gymId: string, dto: UpdateSensorDto, actorTrainerId: string) {
    const sensor = await this.prisma.sensor.findUnique({ where: { id } });
    if (!sensor || sensor.gymId !== gymId) throw new NotFoundException('Sensor not found.');

    if (dto.sensorId && dto.sensorId !== sensor.sensorId) {
      const clash = await this.prisma.sensor.findFirst({ where: { gymId, sensorId: dto.sensorId, NOT: { id } } });
      if (clash) throw new ConflictException('A sensor with this Sensor ID is already registered at your gym.');
    }

    const updated = await this.prisma.sensor.update({ where: { id }, data: dto });
    await this.auditLog.record({ actorType: 'staff', actorId: actorTrainerId, action: 'sensor.update', targetType: 'sensor', targetId: id, payload: { gymId } });
    return updated;
  }

  async delete(id: string, gymId: string, actorTrainerId: string) {
    const sensor = await this.prisma.sensor.findUnique({ where: { id } });
    if (!sensor || sensor.gymId !== gymId) throw new NotFoundException('Sensor not found.');

    await this.prisma.sensor.delete({ where: { id } });
    await this.auditLog.record({ actorType: 'staff', actorId: actorTrainerId, action: 'sensor.delete', targetType: 'sensor', targetId: id, payload: { gymId } });
    return { deleted: true };
  }

  // Admin Panel — read-only visibility across every gym's sensor
  // inventory (spec: "Sensor tab should be there ... to see all the
  // sensors id name" on the admin side too).
  listAllForAdmin() {
    return this.prisma.sensor.findMany({ include: { gym: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } });
  }

  /**
   * Admin-side bulk registration — the admin can do exactly what a
   * branch manager does in their own Sensors tab, for any gym: one
   * shared name (+ optional note) and a comma-separated list of sensor
   * IDs ("12345,12346, 12347") becomes one Sensor row per ID, in one
   * transaction. The registered count is the session-capacity cap, so
   * this immediately raises that gym's slot ceiling.
   *
   * Behavior per ID: whitespace-trimmed, de-duplicated, skipped (with a
   * report) if that gym already has it — never a partial failure; the
   * whole batch lands or nothing does.
   */
  async bulkCreateForAdmin(gymId: string, dto: BulkCreateSensorsDto, adminId: string) {
    const gym = await this.prisma.gym.findUnique({ where: { id: gymId }, select: { id: true, name: true } });
    if (!gym) throw new NotFoundException('Gym not found.');

    const parsed = [...new Set(
      dto.sensorIds
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    )];
    if (parsed.length === 0) {
      throw new ConflictException('Paste at least one sensor ID (comma-separated, e.g. 12345,12346).');
    }

    const existing = await this.prisma.sensor.findMany({ where: { gymId, sensorId: { in: parsed } }, select: { sensorId: true } });
    const existingSet = new Set(existing.map((s) => s.sensorId));
    const toCreate = parsed.filter((id) => !existingSet.has(id));
    const skipped = parsed.filter((id) => existingSet.has(id));

    const created = await this.prisma.$transaction(
      toCreate.map((sensorId) => this.prisma.sensor.create({ data: { gymId, name: dto.name, sensorId, note: dto.note } })),
    );

    if (created.length) {
      await this.auditLog.record({
        actorType: 'admin', actorId: adminId, action: 'sensor.bulk_create', targetType: 'gym', targetId: gymId,
        payload: { gymId, name: dto.name, count: created.length, sensorIds: created.map((s) => s.sensorId) },
      });
    }

    return {
      gymId,
      gymName: gym.name,
      createdCount: created.length,
      skippedCount: skipped.length,
      skippedIds: skipped,
      created: created.map((s) => ({ id: s.id, sensorId: s.sensorId })),
    };
  }

  /**
   * Admin-side delete — removes any sensor row by id, regardless of
   * which gym owns it (admins are platform-wide). Same effect as the
   * branch manager's own Sensors-tab delete: lowering that gym's
   * registered-strap count also lowers its session-capacity ceiling,
   * so this is audited with the gym + sensor id in the payload.
   */
  async deleteForAdmin(id: string, adminId: string) {
    const sensor = await this.prisma.sensor.findUnique({ where: { id }, include: { gym: { select: { name: true } } } });
    if (!sensor) throw new NotFoundException('Sensor not found.');

    await this.prisma.sensor.delete({ where: { id } });
    await this.auditLog.record({
      actorType: 'admin', actorId: adminId, action: 'sensor.delete', targetType: 'sensor', targetId: id,
      payload: { gymId: sensor.gymId, sensorId: sensor.sensorId, name: sensor.name },
    });
    return { deleted: true, gymId: sensor.gymId, sensorId: sensor.sensorId };
  }

  // ── Connectivity dashboard telemetry ──────────────────────────────
  //
  // Written by the Trainer App on every connection-state CHANGE for a
  // sensor (connected / reconnecting / disconnected) and on every
  // battery poll — not on every tick, so this stays cheap even with a
  // full gym floor of sensors reporting. Read by:
  //   - Trainer App's own pre-flight check (though it also has live
  //     BLE state locally and doesn't strictly need this round-trip)
  //   - Branch Portal / Admin Panel "sensor health" views, which have
  //     no other way to see battery/connectivity outside a live session
  /** Upsert one sensor's live telemetry. `sensorId` here is the human-entered label (Sensor.sensorId), matching what the Trainer App already keys BLE devices by — never the Sensor row's internal uuid. */
  async upsertTelemetry(
    gymId: string,
    sensorId: string,
    data: { batteryPct?: number; connectionState: 'connected' | 'reconnecting' | 'disconnected'; sessionId?: string },
  ) {
    return this.prisma.sensorTelemetry.upsert({
      where: { sensorId },
      create: {
        sensorId,
        gymId,
        batteryPct: data.batteryPct,
        connectionState: data.connectionState,
        lastSeenAt: new Date(),
        lastSessionId: data.sessionId,
      },
      update: {
        batteryPct: data.batteryPct,
        connectionState: data.connectionState,
        lastSeenAt: new Date(),
        ...(data.sessionId ? { lastSessionId: data.sessionId } : {}),
      },
    });
  }

  /** Pre-flight / dashboard read — every sensor registered to the gym, left-joined against its latest telemetry (a sensor that's never reported in has no telemetry row and reads as "disconnected, unknown battery" rather than being omitted). */
  async listTelemetryForGym(gymId: string) {
    const [sensors, telemetry] = await Promise.all([
      this.prisma.sensor.findMany({ where: { gymId } }),
      this.prisma.sensorTelemetry.findMany({ where: { gymId } }),
    ]);
    const bySensorId = new Map(telemetry.map((t) => [t.sensorId, t]));
    return sensors.map((s) => ({
      sensor: s,
      telemetry: bySensorId.get(s.sensorId) ?? { connectionState: 'disconnected' as const, batteryPct: null, lastSeenAt: null },
    }));
  }
}
