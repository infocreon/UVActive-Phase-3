#!/usr/bin/env node
/**
 * create-admin.cjs — One-time admin account creation for first super_admin.
 *
 * Usage:
 *   node scripts/create-admin.cjs
 *
 * This is intentionally NOT exposed via any API route — the first admin must
 * be created from a trusted operator's machine with direct DB access.
 * Subsequent admins are created via POST /api/v1/admin/admins by an existing
 * super_admin.
 *
 * The script:
 *   1. Prompts for name, email, password (min 12 chars)
 *   2. Hashes password with argon2id
 *   3. Creates the admin row in the `admins` table
 *   4. Prints the admin ID and instructs on TOTP setup
 */

const { PrismaClient } = require('@prisma/client');
const * as argon2 from 'argon2';
const readline = require('readline');

const prisma = new PrismaClient();

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans); }));
}

async function main() {
  console.log('=== UV Active Cloud API — Create First Super Admin ===\n');

  const existingCount = await prisma.admin.count();
  if (existingCount > 0) {
    console.log(`\nThere are already ${existingCount} admin account(s) in the database.`);
    console.log('To create additional admins, use: POST /api/v1/admin/admins');
    console.log('To reset this admin\'s password, use: POST /api/v1/auth/admin/forgot-password\n');
    process.exit(0);
  }

  const name = (await ask('Super admin name: ')).trim();
  if (!name) {
    console.error('Name is required.');
    process.exit(1);
  }

  const email = (await ask('Super admin email: ')).trim().toLowerCase();
  if (!email || !email.includes('@')) {
    console.error('Valid email is required.');
    process.exit(1);
  }

  const password = (await ask('Super admin password (min 12 characters): ')).trim();
  if (password.length < 12) {
    console.error('Password must be at least 12 characters.');
    process.exit(1);
  }

  console.log('\nCreating admin account...');

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const admin = await prisma.admin.create({
    data: { name, email, passwordHash, role: 'super_admin' },
  });

  console.log('\n✓ Admin account created successfully!\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  ADMIN CREDENTIALS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Admin ID:      ${admin.id}`);
  console.log(`  Admin Email:   ${admin.email}`);
  console.log(`  Admin Role:    super_admin`);
  console.log('───────────────────────────────────────────────────────────────');
  console.log(`  Password:      ${password}`);
  console.log('───────────────────────────────────────────────────────────────');
  console.log('\n  ⚠️  SAVE THESE CREDENTIALS SECURELY — they cannot be recovered!');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('NEXT STEPS:');
  console.log('  1. Log in with: POST /api/v1/auth/admin/login');
  console.log('     Body: { "email": "'+admin.email+'", "password": "'+password+'" }');
  console.log('  2. First login will return: { "setupRequired": true, "setupToken": "..." }');
  console.log('  3. Set up TOTP: POST /api/v1/auth/admin/2fa/setup with setupToken');
  console.log('  4. Confirm TOTP: POST /api/v1/auth/admin/2fa/confirm with code');
  console.log('  5. Save the 10 backup codes shown during TOTP setup\n');

  await prisma.$disconnect();
}

main()
  .catch((e) => { console.error('\n✗ Error:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
