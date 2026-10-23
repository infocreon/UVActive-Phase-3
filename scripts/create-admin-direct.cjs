#!/usr/bin/env node
/**
 * create-admin-direct.cjs — Create the first super_admin with predefined credentials.
 * Run this after npm install and prisma generate.
 *
 * Usage:
 *   node scripts/create-admin-direct.cjs
 *
 * Requires: DATABASE_URL in .env or environment
 */

const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');

const prisma = new PrismaClient();

// Predefined admin credentials (generated securely)
const ADMIN_EMAIL = 'admin@uvactive.local';
const ADMIN_NAME = 'System Admin';
const ADMIN_PASSWORD = '8ao_uMS8VvE287ew2YM_!@';

async function main() {
  console.log('=== Creating First Super Admin ===\n');

  // Check if admin already exists
  const existing = await prisma.admin.findUnique({
    where: { email: ADMIN_EMAIL },
  });

  if (existing) {
    console.log('⚠️  Admin already exists:');
    console.log(`   Email: ${existing.email}`);
    console.log(`   ID: ${existing.id}`);
    console.log(`   Role: ${existing.role}`);
    console.log('\n   To reset password, use: POST /api/v1/auth/admin/forgot-password\n');
    await prisma.$disconnect();
    return;
  }

  console.log(`Creating admin account...`);
  console.log(`   Name:  ${ADMIN_NAME}`);
  console.log(`   Email: ${ADMIN_EMAIL}`);
  console.log(`   Password: ${ADMIN_PASSWORD}\n`);

  // Hash password
  const passwordHash = await argon2.hash(ADMIN_PASSWORD, { type: argon2.argon2id });

  // Create admin
  const admin = await prisma.admin.create({
    data: {
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      passwordHash,
      role: 'super_admin',
    },
  });

  console.log('✓ Admin account created successfully!\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  ADMIN CREDENTIALS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Admin ID:   ${admin.id}`);
  console.log(`  Email:      ${admin.email}`);
  console.log(`  Role:       super_admin`);
  console.log(`  Password:   ${ADMIN_PASSWORD}`);
  console.log('───────────────────────────────────────────────────────────────');
  console.log('\n  ⚠️  SAVE THESE CREDENTIALS — password cannot be recovered!');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('NEXT STEPS:');
  console.log('  1. Start the backend: npm run start:dev');
  console.log('  2. Login via Admin Panel at: http://localhost:5173');
  console.log('  3. First login will prompt for TOTP setup');
  console.log('  4. Use an authenticator app (Google Authenticator, Authy, etc.)');
  console.log('  5. Save the 10 backup codes shown during setup\n');

  await prisma.$disconnect();
}

main()
  .catch((e) => {
    console.error('\n✗ Error creating admin:', e.message);
    if (e.code === 'P1001') {
      console.error('\nDatabase connection error. Please check your DATABASE_URL in .env');
      console.error('Expected format: postgresql://user:password@host:port/database?sslmode=require');
    }
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
