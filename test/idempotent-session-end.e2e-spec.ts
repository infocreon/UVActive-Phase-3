import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { SessionsService } from '../src/sessions/sessions.service';
import { createTestApp, resetDb, seedGymWithTrainer, seedMember } from './setup';

describe('Idempotent session-end (spec §7, §13 / §17 checklist)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sessions: SessionsService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    sessions = app.get(SessionsService);
  });

  afterAll(async () => {
    await resetDb(prisma);
    await app.close();
  });

  afterEach(async () => {
    await resetDb(prisma);
  });

  it('never creates a duplicate session_members row on a retried end payload', async () => {
    const { gym, trainer } = await seedGymWithTrainer(prisma);
    const { member } = await seedMember(prisma, gym.id);
    const session = await prisma.session.create({ data: { gymId: gym.id, trainerId: trainer.id, name: 'Class', capacity: 10 } });

    await sessions.enrollMember(session.id, member.id, 'trainer');
    await sessions.start(session.id, trainer.id);

    const payload = { results: [{ memberId: member.id, avgHr: 140, maxHr: 170, calories: 300, score: 88 }] };

    await sessions.end(session.id, payload, trainer.id);
    // Simulate the trainer app's offline outbox retrying the exact same upload.
    await sessions.end(session.id, payload, trainer.id);

    const rows = await prisma.sessionMember.findMany({ where: { sessionId: session.id, memberId: member.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].avgHr).toBe(140);
    expect(rows[0].score).toBe(88);

    const finalSession = await prisma.session.findUnique({ where: { id: session.id } });
    expect(finalSession?.status).toBe('completed');
  });

  it('stores a result for a same-gym member whose enroll request was lost (no data thrown away)', async () => {
    const { gym, trainer } = await seedGymWithTrainer(prisma);
    const { member } = await seedMember(prisma, gym.id);
    const session = await prisma.session.create({ data: { gymId: gym.id, trainerId: trainer.id, name: 'Class', capacity: 10 } });
    await sessions.start(session.id, trainer.id);

    await sessions.end(session.id, { results: [{ memberId: member.id, avgHr: 120, score: 70 }] }, trainer.id);

    const row = await prisma.sessionMember.findUnique({ where: { sessionId_memberId: { sessionId: session.id, memberId: member.id } } });
    expect(row?.avgHr).toBe(120);
    expect(row?.score).toBe(70);
  });

  it('still rejects a result for a member who does not belong to the session\'s branch', async () => {
    const { gym, trainer } = await seedGymWithTrainer(prisma);
    const { gym: otherGym } = await seedGymWithTrainer(prisma);
    const { member: outsider } = await seedMember(prisma, otherGym.id);
    const session = await prisma.session.create({ data: { gymId: gym.id, trainerId: trainer.id, name: 'Class', capacity: 10 } });
    await sessions.start(session.id, trainer.id);

    await expect(
      sessions.end(session.id, { results: [{ memberId: outsider.id, avgHr: 120 }] }, trainer.id),
    ).rejects.toThrow(/does not belong/);
  });

  it('ends a never-started (offline) session by starting it implicitly, keeping the phone\'s real times', async () => {
    const { gym, trainer } = await seedGymWithTrainer(prisma);
    const session = await prisma.session.create({ data: { gymId: gym.id, trainerId: trainer.id, name: 'Class', capacity: 10 } });
    const startedAt = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
    const endedAt = new Date(Date.now() - 3 * 24 * 3600 * 1000 + 45 * 60 * 1000).toISOString();

    await sessions.end(session.id, { results: [], startedAt, endedAt, durationSeconds: 2700 }, trainer.id);

    const final = await prisma.session.findUnique({ where: { id: session.id } });
    expect(final?.status).toBe('completed');
    expect(final?.startedAt?.toISOString()).toBe(startedAt);
    expect(final?.endedAt?.toISOString()).toBe(endedAt);
    expect(final?.durationSeconds).toBe(2700);
  });
});
