/*
  Give one or more accounts a new temporary password, e.g. if the only admin
  is locked out. Run from the server folder:

    npm run reset-password -- admin@crm.com rep@crm.com
    npm run reset-password -- --admins          (everyone on the Administrator profile)

  Passwords are written to the private CRM folder, not printed. Each person
  must choose a new password at sign-in, and existing sessions are ended.
*/
import { PrismaClient } from '@prisma/client';
import { generateTemporaryPassword, hashPassword } from '../src/auth/passwords';
import { writeSignInDetails } from '../src/auth/sign-in-details';
import { ADMINISTRATOR_PROFILE_ID } from '../src/permissions/permissions';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: npm run reset-password -- <email> [email...]   or   -- --admins');
    process.exit(1);
  }

  const users = args.includes('--admins')
    ? await prisma.user.findMany({ where: { roleProfileId: ADMINISTRATOR_PROFILE_ID } })
    : await prisma.user.findMany({ where: { email: { in: args.map((a) => a.toLowerCase()) } } });

  const found = new Set(users.map((u) => u.email));
  for (const email of args.filter((a) => !a.startsWith('--'))) {
    if (!found.has(email.toLowerCase())) console.warn(`No account found for ${email}`);
  }
  if (users.length === 0) process.exit(1);

  const entries: { email: string; password: string }[] = [];
  for (const user of users) {
    const password = generateTemporaryPassword();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(password),
        mustChangePassword: true,
        passwordChangedAt: new Date(),
      },
    });
    entries.push({ email: user.email, password });
  }

  const file = writeSignInDetails(entries);
  console.log(`Reset ${entries.length} account(s). Temporary passwords are in: ${file}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
