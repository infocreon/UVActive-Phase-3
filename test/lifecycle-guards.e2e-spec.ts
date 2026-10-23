import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { GymsService } from '../src/gyms/gyms.service';
import { TrainersService } from '../src/trainers/trainers.service';
import { createTestApp, resetDb, seedGymWithTrainer, seedMember } from './setup';

describe('Lifecycle guards (spec §17 checklist)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let gyms: GymsService;
  let trainers: TrainersService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    gyms = app.get(GymsService);
    trainers = app.get(TrainersService);
  });

  afterAll(async () => {
    await resetDb(prisma);
    await app.close();
  });

  afterEach(async () => {
    await resetDb(prisma);
  });

  it('hard-deletes the gym with every associated row (sessions, members, trainers, sensors, history)', async () => {
    const { gym, trainer } = await seedGymWithTrainer(prisma);
    const { member } = await seedMember(prisma, gym.id);
    const future = new Date(Date.now() + 24 * 3600 * 1000);
    const session = await prisma.session.create({ data: { gymId: gym.id, trainerId: trainer.id, name: 'Morning HIIT', scheduledAt: future } });
    const sessionMember = await prisma.sessionMember.create({ data: { sessionId: session.id, memberId: member.id, enrolledBy: 'branch' } });
    await prisma.sensorReading.create({ data: { sessionMemberId: sessionMember.id, ts: new Date(), hr: 120 } });
    await prisma.sensor.create({ data: { gymId: gym.id, name: 'Strap 1', sensorId: ' strap-1' } });

    const result = await gyms.remove(gym.id, 'test-admin-id');

    expect(result.ok).toBe(true);
    expect(result.sessionsDeleted).toBe(1);
    expect(result.membersDeleted).toBe(1);
    expect(result.trainersDeleted).toBe(2); // trainer + branch manager
    expect(result.sensorsDeleted).toBe(1);

    expect(await prisma.gym.findUnique({ where: { id: gym.id } })).toBeNull();
    expect(await prisma.session.findUnique({ where: { id: session.id } })).toBeNull();
    expect(await prisma.sessionMember.findUnique({ where: { id: sessionMember.id } })).toBeNull();
    expect(await prisma.sensorReading.findFirst({ where: { sessionMemberId: sessionMember.id } })).toBeNull();
    expect(await prisma.sensor.findFirst({ where: { gymId: gym.id } })).toBeNull();
    expect(await prisma.member.findUnique({ where: { id: member.id } })).toBeNull();
    expect(await prisma.trainer.findFirst({ where: { gymId: gym.id } })).toBeNull();
    expect(await prisma.memberGymHistory.findFirst({ where: { gymId: gym.id } })).toBeNull();
  });

  it('keeps (detaches) members that also have a footprint at another gym', async () => {
    const { gym } = await seedGymWithTrainer(prisma);
    const otherGym = await prisma.gym.create({ data: { name: 'Other Gym', memberLimit: 10 } });
    const { member } = await seedMember(prisma, gym.id);
    await prisma.memberGymHistory.create({ data: { memberId: member.id, gymId: otherGym.id } });

    const result = await gyms.remove(gym.id, 'test-admin-id');

    expect(result.membersDeleted).toBe(0);
    expect(result.membersDetached).toBe(1);
    const kept = await prisma.member.findUnique({ where: { id: member.id } });
    expect(kept).not.toBeNull();
    expect(kept?.currentGymId).toBeNull();
    expect(await prisma.gym.findUnique({ where: { id: gym.id } })).toBeNull();
  });

  it('flags every future scheduled session needs_reassignment=true when its trainer is suspended', async () => {
    const { gym, trainer } = await seedGymWithTrainer(prisma);
    const future = new Date(Date.now() + 24 * 3600 * 1000);
    const past = new Date(Date.now() - 24 * 3600 * 1000);

    const futureSession = await prisma.session.create({ data: { gymId: gym.id, trainerId: trainer.id, name: 'Tomorrow', scheduledAt: future } });
    const pastSession = await prisma.session.create({ data: { gymId: gym.id, trainerId: trainer.id, name: 'Yesterday', scheduledAt: past } });

    await trainers.setStatus(trainer.id, 'suspended', 'staff', 'test-manager-id', gym.id);

    const refreshedFuture = await prisma.session.findUnique({ where: { id: futureSession.id } });
    const refreshedPast = await prisma.session.findUnique({ where: { id: pastSession.id } });
    expect(refreshedFuture?.needsReassignment).toBe(true);
    expect(refreshedPast?.needsReassignment).toBe(false); // already in the past — not a candidate for reassignment

    const branchAlert = await prisma.notification.findFirst({ where: { recipientType: 'branch', recipientId: gym.id, type: 'reassignment_needed' } });
    expect(branchAlert).not.toBeNull();
  });
});
