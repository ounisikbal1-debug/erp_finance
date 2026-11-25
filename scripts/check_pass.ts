import prisma from '../src/data/prisma/client';
import { verifyPassword } from '../src/application/security/passwords';

async function test() {
  const users = await prisma.user.findMany();
  console.log(`Total users in DB: ${users.length}`);
  const testPasswords = [
    'Admin123!',
    'ChangeMe123!',
    'Safe2026!',
    'safe2026',
    'admin',
    'admin123',
    'password',
    'Admin@2026',
    'P@ssword123!',
    'SafeERP2026!',
    'Tunisie2026!'
  ];
  for (const u of users) {
    let found = false;
    for (const p of testPasswords) {
      if (await verifyPassword(p, u.passwordHash)) {
        console.log(`MATCH: user ${u.username} has password: ${p}`);
        found = true;
        break;
      }
    }
    if (!found) {
      console.log(`NO MATCH among common passwords for: ${u.username} (hash: ${u.passwordHash.slice(0, 30)}...)`);
    }
  }
}

test().catch(console.error).finally(() => prisma.$disconnect());
