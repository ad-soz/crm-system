/*
  Set a specific password for a user account.
  
  Run from the server folder:
    npm run ts-node scripts/set-password.ts admin@crm.com 1234567890A!
*/
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/auth/passwords';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: npm run ts-node scripts/set-password.ts <email> <password>');
    process.exit(1);
  }

  const email = args[0].toLowerCase();
  const password = args[1];

  if (password.length < 10) {
    console.error('Password must be at least 10 characters');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No account found for ${email}`);
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(password),
      mustChangePassword: false,
      passwordChangedAt: new Date(),
    },
  });

  console.log(`✓ Password set for ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
