import { PrismaClient } from '@prisma/client';
import { generateTemporaryPassword, hashPassword } from '../src/auth/passwords';
import { writeSignInDetails } from '../src/auth/sign-in-details';
import {
  ADMINISTRATOR_PROFILE_ID,
  ALL_PERMISSIONS,
  SALES_REP_PERMISSIONS,
  SALES_REP_PROFILE_ID,
} from '../src/permissions/permissions';

const prisma = new PrismaClient();

async function main() {
  // Clear existing data (child rows first)
  await prisma.contact.deleteMany();
  await prisma.task.deleteMany();
  await prisma.companyIndustry.deleteMany();
  await prisma.deal.deleteMany();
  await prisma.person.deleteMany();
  await prisma.company.deleteMany();
  await prisma.user.deleteMany();

  // The built-in profiles are created by the role_profiles migration; make
  // sure they exist even if someone removed the Sales Rep profile.
  await prisma.roleProfile.upsert({
    where: { id: ADMINISTRATOR_PROFILE_ID },
    update: {},
    create: {
      id: ADMINISTRATOR_PROFILE_ID,
      name: 'Administrator',
      description: 'Full access to everything, including users and settings. Cannot be changed.',
      permissions: JSON.stringify(ALL_PERMISSIONS),
      isSystem: true,
    },
  });
  await prisma.roleProfile.upsert({
    where: { id: SALES_REP_PROFILE_ID },
    update: {},
    create: {
      id: SALES_REP_PROFILE_ID,
      name: 'Sales Rep',
      description: 'Works with people, companies, deals, contacts, and tasks.',
      permissions: JSON.stringify(SALES_REP_PERMISSIONS),
    },
  });

  // Create users with random temporary passwords. They're written to the
  // private CRM folder, and each person must choose their own at first sign-in.
  const adminPassword = generateTemporaryPassword();
  const repPassword = generateTemporaryPassword();

  const admin = await prisma.user.create({
    data: {
      email: 'admin@crm.com',
      passwordHash: await hashPassword(adminPassword),
      mustChangePassword: true,
      firstName: 'Sarah',
      lastName: 'Admin',
      roleProfileId: ADMINISTRATOR_PROFILE_ID,
    },
  });

  const rep = await prisma.user.create({
    data: {
      email: 'rep@crm.com',
      passwordHash: await hashPassword(repPassword),
      mustChangePassword: true,
      firstName: 'John',
      lastName: 'Rep',
      roleProfileId: SALES_REP_PROFILE_ID,
    },
  });

  const detailsFile = writeSignInDetails([
    { email: admin.email, password: adminPassword },
    { email: rep.email, password: repPassword },
  ]);

  // Reference lists (created by the migration; upserted here so a clean reset
  // also gets them). Records below use the fixed ids.
  await seedReferenceLists();

  // Create companies, each linked to one or more industries
  const acme = await prisma.company.create({
    data: {
      name: 'Acme Corporation',
      website: 'https://acme.com',
      phone: '+1-555-0100',
      email: 'info@acme.com',
      address: '123 Industrial Ave, Springfield',
      industries: { create: [{ industryId: 'ind-manufacturing' }] },
    },
  });

  const techCorp = await prisma.company.create({
    data: {
      name: 'TechCorp Solutions',
      website: 'https://techcorp.com',
      phone: '+1-555-0200',
      email: 'hello@techcorp.com',
      address: '456 Innovation Dr, Austin',
      industries: { create: [{ industryId: 'ind-technology' }, { industryId: 'ind-saas' }] },
    },
  });

  const greenEnergy = await prisma.company.create({
    data: {
      name: 'GreenEnergy LLC',
      website: 'https://greenenergy.com',
      phone: '+1-555-0300',
      email: 'contact@greenenergy.com',
      address: '789 Solar Way, Portland',
      industries: { create: [{ industryId: 'ind-energy' }] },
    },
  });

  // Create people
  const person1 = await prisma.person.create({
    data: {
      firstName: 'Alice',
      lastName: 'Johnson',
      email: 'alice@acme.com',
      phone: '+1-555-0101',
      title: 'Procurement Manager',
      companyId: acme.id,
      ownerId: rep.id,
    },
  });

  const person2 = await prisma.person.create({
    data: {
      firstName: 'Bob',
      lastName: 'Smith',
      email: 'bob@acme.com',
      phone: '+1-555-0102',
      title: 'CTO',
      companyId: acme.id,
      ownerId: admin.id,
    },
  });

  const person3 = await prisma.person.create({
    data: {
      firstName: 'Carol',
      lastName: 'Davis',
      email: 'carol@techcorp.com',
      phone: '+1-555-0201',
      title: 'VP Engineering',
      companyId: techCorp.id,
      ownerId: rep.id,
    },
  });

  const person4 = await prisma.person.create({
    data: {
      firstName: 'David',
      lastName: 'Wilson',
      email: 'david@greenenergy.com',
      phone: '+1-555-0301',
      title: 'CEO',
      companyId: greenEnergy.id,
      ownerId: rep.id,
    },
  });

  const person5 = await prisma.person.create({
    data: {
      firstName: 'Emma',
      lastName: 'Brown',
      email: 'emma@techcorp.com',
      phone: '+1-555-0202',
      title: 'Product Manager',
      companyId: techCorp.id,
      ownerId: admin.id,
    },
  });

  // Create deals in various stages
  await prisma.deal.create({
    data: {
      title: 'Acme ERP License',
      amount: 75000,
      stageId: 'stage-negotiation',
      companyId: acme.id,
      personId: person1.id,
      ownerId: rep.id,
      expectedCloseDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.deal.create({
    data: {
      title: 'TechCloud Migration',
      amount: 120000,
      stageId: 'stage-qualified',
      companyId: techCorp.id,
      personId: person3.id,
      ownerId: rep.id,
      expectedCloseDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.deal.create({
    data: {
      title: 'GreenEnergy Analytics',
      amount: 45000,
      stageId: 'stage-proposal',
      companyId: greenEnergy.id,
      personId: person4.id,
      ownerId: admin.id,
      expectedCloseDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.deal.create({
    data: {
      title: 'Acme Support Contract',
      amount: 15000,
      stageId: 'stage-lead',
      companyId: acme.id,
      personId: person2.id,
      ownerId: rep.id,
    },
  });

  // Create contacts
  await prisma.contact.create({
    data: {
      typeId: 'type-call',
      subject: 'Initial discovery call',
      description: 'Discussed needs and timeline. Alice is interested in the ERP package.',
      personId: person1.id,
      userId: rep.id,
    },
  });

  await prisma.contact.create({
    data: {
      typeId: 'type-email',
      subject: 'Sent pricing proposal',
      description: 'Followed up on the call with a detailed pricing proposal.',
      personId: person1.id,
      userId: rep.id,
    },
  });

  await prisma.contact.create({
    data: {
      typeId: 'type-meeting',
      subject: 'Product demo',
      description: 'Demoed the analytics platform to Carol and her team.',
      personId: person3.id,
      dealId: (await prisma.deal.findFirst({ where: { title: 'TechCloud Migration' } }))!.id,
      userId: rep.id,
    },
  });

  await prisma.contact.create({
    data: {
      typeId: 'type-note',
      subject: 'David prefers annual billing',
      description: 'David mentioned they prefer annual billing cycles over monthly.',
      personId: person4.id,
      userId: admin.id,
    },
  });

  // Create tasks
  await prisma.task.create({
    data: {
      title: 'Send contract to Alice',
      description: 'Finalize and send the ERP license contract.',
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      statusId: 'status-todo',
      priorityId: 'priority-high',
      personId: person1.id,
      assigneeId: rep.id,
    },
  });

  await prisma.task.create({
    data: {
      title: 'Prepare technical spec for TechCorp',
      description: 'Write up the migration technical specification document.',
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      statusId: 'status-in-progress',
      priorityId: 'priority-medium',
      personId: person3.id,
      assigneeId: rep.id,
    },
  });

  await prisma.task.create({
    data: {
      title: 'Follow up with David',
      description: 'Check if David has questions about the proposal.',
      dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
      statusId: 'status-todo',
      priorityId: 'priority-high',
      personId: person4.id,
      assigneeId: admin.id,
    },
  });

  await prisma.task.create({
    data: {
      title: 'Schedule onboarding meeting',
      description: 'Set up onboarding session with Emma.',
      dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      statusId: 'status-todo',
      priorityId: 'priority-low',
      personId: person5.id,
      assigneeId: admin.id,
    },
  });

  console.log('Seed completed successfully!');
  console.log(`Users: 2, Companies: 3, People: 5, Deals: 4, Contacts: 4, Tasks: 4`);
  console.log(`Temporary sign-in passwords are in: ${detailsFile}`);
}

// Upsert the reference lists so a clean reset gets the same starting values the
// migration creates. Ids are fixed so the seed data above can reference them.
async function seedReferenceLists() {
  const up = async (model: any, rows: any[]) => {
    for (const r of rows) await model.upsert({ where: { id: r.id }, update: r, create: r });
  };

  await prisma.referenceFieldSetting.upsert({
    where: { fieldKey: 'company.industry' },
    update: {},
    create: { fieldKey: 'company.industry', allowMultiple: true },
  });

  await up(prisma.industry, [
    { id: 'ind-technology', name: 'Technology', colour: 'info', sortOrder: 0 },
    { id: 'ind-saas', name: 'SaaS', colour: 'default', sortOrder: 1 },
    { id: 'ind-manufacturing', name: 'Manufacturing', colour: 'secondary', sortOrder: 2 },
    { id: 'ind-energy', name: 'Energy', colour: 'success', sortOrder: 3 },
  ]);
  await up(prisma.dealStage, [
    { id: 'stage-lead', name: 'Lead', colour: 'secondary', sortOrder: 0, isDefault: true, outcome: 'OPEN', winChance: 10 },
    { id: 'stage-qualified', name: 'Qualified', colour: 'info', sortOrder: 1, outcome: 'OPEN', winChance: 25 },
    { id: 'stage-proposal', name: 'Proposal', colour: 'warning', sortOrder: 2, outcome: 'OPEN', winChance: 50 },
    { id: 'stage-negotiation', name: 'Negotiation', colour: 'warning', sortOrder: 3, outcome: 'OPEN', winChance: 75 },
    { id: 'stage-won', name: 'Won', colour: 'success', sortOrder: 4, outcome: 'WON', winChance: 100 },
    { id: 'stage-lost', name: 'Lost', colour: 'destructive', sortOrder: 5, outcome: 'LOST', winChance: 0 },
  ]);
  await up(prisma.contactType, [
    { id: 'type-email', name: 'Email', colour: 'info', sortOrder: 0, icon: 'mail' },
    { id: 'type-call', name: 'Call', colour: 'success', sortOrder: 1, isDefault: true, icon: 'phone' },
    { id: 'type-meeting', name: 'Meeting', colour: 'default', sortOrder: 2, icon: 'users' },
    { id: 'type-note', name: 'Note', colour: 'warning', sortOrder: 3, icon: 'file-text' },
  ]);
  await up(prisma.taskStatus, [
    { id: 'status-todo', name: 'To Do', colour: 'secondary', sortOrder: 0, isDefault: true, isDone: false },
    { id: 'status-in-progress', name: 'In Progress', colour: 'warning', sortOrder: 1, isDone: false },
    { id: 'status-done', name: 'Done', colour: 'success', sortOrder: 2, isDone: true },
  ]);
  await up(prisma.taskPriority, [
    { id: 'priority-low', name: 'Low', colour: 'secondary', sortOrder: 0 },
    { id: 'priority-medium', name: 'Medium', colour: 'info', sortOrder: 1, isDefault: true },
    { id: 'priority-high', name: 'High', colour: 'destructive', sortOrder: 2 },
  ]);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
