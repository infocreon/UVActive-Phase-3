import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/common/utils/token.service';
import { createTestApp, resetDb, seedGymWithTrainer, seedMember, seedAdmin } from './setup';

/**
 * Covers two gaps closed after the fork-consolidation parity review
 * (see PARITY_CHECKLIST.md):
 *   1. `GET /admin/members` and `GET /admin/sessions` previously had no
 *      way to scope the list to a single branch — only global,
 *      unfiltered pagination. This confirms the optional `gymId` query
 *      param actually filters (and that omitting it still returns
 *      every gym's rows, unchanged default behavior).
 *   2. The new `/uploads/*` presign endpoints (src/uploads) — since
 *      this test env never sets S3_* vars, both must fail closed with
 *      a clean 503 STORAGE_NOT_CONFIGURED rather than a 500 or a
 *      silently-broken presigned URL pointing nowhere.
 */
describe('admin gym-scoped listings + uploads config gate', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  const api = () => request(app.getHttpServer());

  const adminAuth = (adminId: string, role: 'super_admin' | 'support') =>
    `Bearer ${tokens.signAccessToken({ sub: adminId, realm: 'admin', role })}`;

  const memberAuth = (memberId: string) => `Bearer ${tokens.signAccessToken({ sub: memberId, realm: 'member' })}`;

  const staffAuth = (staffId: string, role: 'branch_manager' | 'trainer', gymId: string) =>
    `Bearer ${tokens.signAccessToken({ sub: staffId, realm: 'staff', role, gymId, gymTokenVersion: 0 })}`;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
  });

  afterAll(async () => {
    await resetDb(prisma);
    await app.close();
  });

  afterEach(async () => {
    await resetDb(prisma);
  });

  it('GET /admin/members?gymId= returns only that branch\'s members; omitted returns all', async () => {
    const { gym: gymA } = await seedGymWithTrainer(prisma);
    const { gym: gymB } = await seedGymWithTrainer(prisma);
    await seedMember(prisma, gymA.id);
    await seedMember(prisma, gymA.id);
    await seedMember(prisma, gymB.id);
    const { admin } = await seedAdmin(prisma, 'support');

    const scoped = await api()
      .get('/api/v1/admin/members')
      .query({ gymId: gymA.id })
      .set('Authorization', adminAuth(admin.id, 'support'))
      .expect(200);
    expect(scoped.body.data.data).toHaveLength(2);
    expect(scoped.body.data.data.every((m: any) => m.currentGymId === gymA.id)).toBe(true);
    expect(scoped.body.data.meta.gymId).toBe(gymA.id);

    const unscoped = await api()
      .get('/api/v1/admin/members')
      .set('Authorization', adminAuth(admin.id, 'support'))
      .expect(200);
    expect(unscoped.body.data.data.length).toBeGreaterThanOrEqual(3);
    expect(unscoped.body.data.meta.gymId).toBeNull();
  });

  it('GET /admin/sessions?gymId= returns only that branch\'s sessions', async () => {
    const { gym: gymA, trainer: trainerA } = await seedGymWithTrainer(prisma);
    const { gym: gymB, trainer: trainerB } = await seedGymWithTrainer(prisma);
    await prisma.session.create({ data: { gymId: gymA.id, trainerId: trainerA.id, name: 'A1', capacity: 10 } });
    await prisma.session.create({ data: { gymId: gymB.id, trainerId: trainerB.id, name: 'B1', capacity: 10 } });
    const { admin } = await seedAdmin(prisma, 'support');

    const scoped = await api()
      .get('/api/v1/admin/sessions')
      .query({ gymId: gymA.id })
      .set('Authorization', adminAuth(admin.id, 'support'))
      .expect(200);
    expect(scoped.body.data.data).toHaveLength(1);
    expect(scoped.body.data.data[0].gymId).toBe(gymA.id);
  });

  it('POST /uploads/member/photo fails closed with 503 STORAGE_NOT_CONFIGURED when S3 env is unset', async () => {
    const { member } = await seedMember(prisma);
    const res = await api()
      .post('/api/v1/uploads/member/photo')
      .set('Authorization', memberAuth(member.id))
      .send({ contentType: 'image/jpeg' })
      .expect(503);
    expect(res.body.error.code).toBe('STORAGE_NOT_CONFIGURED');
  });

  it('POST /uploads/trainer/photo fails closed the same way for staff', async () => {
    const { gym, trainer } = await seedGymWithTrainer(prisma);
    const res = await api()
      .post('/api/v1/uploads/trainer/photo')
      .set('Authorization', staffAuth(trainer.id, 'trainer', gym.id))
      .send({ contentType: 'image/png' })
      .expect(503);
    expect(res.body.error.code).toBe('STORAGE_NOT_CONFIGURED');
  });

  it('POST /uploads/member/photo rejects a disallowed content type with 400 before ever checking storage config', async () => {
    const { member } = await seedMember(prisma);
    await api()
      .post('/api/v1/uploads/member/photo')
      .set('Authorization', memberAuth(member.id))
      .send({ contentType: 'application/pdf' })
      .expect(400);
  });

  it('member and staff realms cannot call each other\'s upload endpoint', async () => {
    const { member } = await seedMember(prisma);
    const { gym, trainer } = await seedGymWithTrainer(prisma);

    await api()
      .post('/api/v1/uploads/trainer/photo')
      .set('Authorization', memberAuth(member.id))
      .send({ contentType: 'image/jpeg' })
      .expect(401);

    await api()
      .post('/api/v1/uploads/member/photo')
      .set('Authorization', staffAuth(trainer.id, 'trainer', gym.id))
      .send({ contentType: 'image/jpeg' })
      .expect(401);
  });
});
