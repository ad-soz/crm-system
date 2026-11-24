import { Controller, Post } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('setup')
export class SeedDataController {
  constructor(private prisma: PrismaService) {}

  /**
   * Populate the database with realistic test data.
   * POST /setup/seed-data
   * This is safe to call multiple times; it checks if data exists first.
   */
  @Post('seed-data')
  async seedData() {
    try {
      // Check if we already have companies (avoid duplicate seeding)
      const companyCount = await this.prisma.company.count();
      if (companyCount > 0) {
        return {
          success: true,
          message: 'Database already seeded',
          companyCount,
        };
      }

      // Get the admin user
      const admin = await this.prisma.user.findFirst({
        where: { email: 'admin@crm.com' },
      });

      const rep = await this.prisma.user.findFirst({
        where: { email: 'rep@crm.com' },
      });

      if (!admin || !rep) {
        return {
          success: false,
          error: 'Admin and rep users must exist first. Click "Create demo users" first.',
        };
      }

      // Ensure reference data exists (industries, stages, etc.)
      await this.ensureReferenceData();

      // Create companies
      const acme = await this.prisma.company.create({
        data: {
          name: 'Acme Corporation',
          website: 'https://acme.com',
          phone: '+1-555-0100',
          email: 'info@acme.com',
          address: '123 Industrial Ave, Springfield',
          industries: { create: [{ industryId: 'ind-manufacturing' }] },
        },
      });

      const techCorp = await this.prisma.company.create({
        data: {
          name: 'TechCorp Solutions',
          website: 'https://techcorp.com',
          phone: '+1-555-0200',
          email: 'hello@techcorp.com',
          address: '456 Innovation Dr, Austin',
          industries: { create: [{ industryId: 'ind-technology' }, { industryId: 'ind-saas' }] },
        },
      });

      const globalBank = await this.prisma.company.create({
        data: {
          name: 'Global Financial Services',
          website: 'https://globalbank.com',
          phone: '+1-555-0300',
          email: 'business@globalbank.com',
          address: '789 Finance Blvd, New York',
          industries: { create: [{ industryId: 'ind-finance' }] },
        },
      });

      const greenEnergy = await this.prisma.company.create({
        data: {
          name: 'GreenEnergy LLC',
          website: 'https://greenenergy.com',
          phone: '+1-555-0400',
          email: 'contact@greenenergy.com',
          address: '321 Solar Way, Portland',
          industries: { create: [{ industryId: 'ind-energy' }] },
        },
      });

      // Create people
      const contacts = [
        {
          firstName: 'Alice',
          lastName: 'Johnson',
          email: 'alice@acme.com',
          phone: '+1-555-0101',
          title: 'Procurement Manager',
          company: acme,
          owner: rep,
        },
        {
          firstName: 'Bob',
          lastName: 'Smith',
          email: 'bob@acme.com',
          phone: '+1-555-0102',
          title: 'CTO',
          company: acme,
          owner: admin,
        },
        {
          firstName: 'Carol',
          lastName: 'Davis',
          email: 'carol@techcorp.com',
          phone: '+1-555-0201',
          title: 'VP Engineering',
          company: techCorp,
          owner: rep,
        },
        {
          firstName: 'David',
          lastName: 'Wilson',
          email: 'david@globalbank.com',
          phone: '+1-555-0301',
          title: 'Head of Operations',
          company: globalBank,
          owner: admin,
        },
        {
          firstName: 'Emma',
          lastName: 'Brown',
          email: 'emma@techcorp.com',
          phone: '+1-555-0202',
          title: 'Product Manager',
          company: techCorp,
          owner: rep,
        },
        {
          firstName: 'Frank',
          lastName: 'Miller',
          email: 'frank@greenenergy.com',
          phone: '+1-555-0401',
          title: 'CEO',
          company: greenEnergy,
          owner: rep,
        },
      ];

      const people = await Promise.all(
        contacts.map((c) =>
          this.prisma.person.create({
            data: {
              firstName: c.firstName,
              lastName: c.lastName,
              email: c.email,
              phone: c.phone,
              title: c.title,
              companyId: c.company.id,
              ownerId: c.owner.id,
            },
          })
        )
      );

      // Create deals in various stages
      const deals = [
        {
          title: 'Acme ERP Implementation',
          amount: 150000,
          stage: 'stage-negotiation',
          company: acme,
          person: people[0],
          owner: rep,
          closeDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
        {
          title: 'TechCloud Migration Project',
          amount: 250000,
          stage: 'stage-qualified',
          company: techCorp,
          person: people[2],
          owner: rep,
          closeDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        {
          title: 'GlobalBank Digital Transformation',
          amount: 500000,
          stage: 'stage-proposal',
          company: globalBank,
          person: people[3],
          owner: admin,
          closeDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
        },
        {
          title: 'GreenEnergy Analytics Platform',
          amount: 85000,
          stage: 'stage-lead',
          company: greenEnergy,
          person: people[5],
          owner: rep,
          closeDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        },
        {
          title: 'Acme Support Contract Renewal',
          amount: 25000,
          stage: 'stage-lead',
          company: acme,
          person: people[1],
          owner: admin,
          closeDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      ];

      const createdDeals = await Promise.all(
        deals.map((d) =>
          this.prisma.deal.create({
            data: {
              title: d.title,
              amount: d.amount,
              stageId: d.stage,
              companyId: d.company.id,
              personId: d.person.id,
              ownerId: d.owner.id,
              expectedCloseDate: d.closeDate,
            },
          })
        )
      );

      // Create contacts (activities)
      const activitiesData = [
        {
          typeId: 'type-call',
          subject: 'Initial discovery call',
          description: 'Discussed ERP requirements and timeline. Alice indicated strong interest.',
          person: people[0],
          deal: createdDeals[0],
          user: rep,
        },
        {
          typeId: 'type-email',
          subject: 'Sent detailed proposal',
          description: 'Sent comprehensive ERP proposal with pricing breakdown and implementation timeline.',
          person: people[0],
          deal: createdDeals[0],
          user: rep,
        },
        {
          typeId: 'type-meeting',
          subject: 'Technical requirements workshop',
          description: 'Held workshop with Carol, Emma, and their technical team. Covered architecture, integrations, and security.',
          person: people[2],
          deal: createdDeals[1],
          user: rep,
        },
        {
          typeId: 'type-note',
          subject: 'CEO expressed budget concerns',
          description: 'Frank mentioned budget is tight but project is strategic priority for the company.',
          person: people[5],
          deal: createdDeals[3],
          user: rep,
        },
        {
          typeId: 'type-call',
          subject: 'Follow-up call with David',
          description: 'Discussed implementation timeline and resource requirements. Very receptive.',
          person: people[3],
          deal: createdDeals[2],
          user: admin,
        },
      ];

      await Promise.all(
        activitiesData.map((a) =>
          this.prisma.contact.create({
            data: {
              typeId: a.typeId,
              subject: a.subject,
              description: a.description,
              personId: a.person.id,
              dealId: a.deal.id,
              userId: a.user.id,
            },
          })
        )
      );

      // Create tasks
      const tasksData = [
        {
          title: 'Send contract to Alice',
          description: 'Finalize contract and send to Alice for review and signature.',
          person: people[0],
          deal: createdDeals[0],
          assignee: rep,
          dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
          priority: 'priority-high',
          status: 'status-todo',
        },
        {
          title: 'Prepare technical architecture document',
          description: 'Create detailed technical architecture document for TechCorp migration.',
          person: people[2],
          deal: createdDeals[1],
          assignee: rep,
          dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
          priority: 'priority-high',
          status: 'status-in-progress',
        },
        {
          title: 'Schedule executive steering committee',
          description: 'Set up kick-off meeting with GlobalBank executive sponsors.',
          person: people[3],
          deal: createdDeals[2],
          assignee: admin,
          dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
          priority: 'priority-high',
          status: 'status-todo',
        },
        {
          title: 'Get budget approval from Frank',
          description: 'Follow up with Frank on budget approval for GreenEnergy project.',
          person: people[5],
          deal: createdDeals[3],
          assignee: rep,
          dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          priority: 'priority-medium',
          status: 'status-todo',
        },
        {
          title: 'Review Acme support pricing',
          description: 'Review and update support contract pricing for renewal.',
          person: people[1],
          deal: createdDeals[4],
          assignee: admin,
          dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
          priority: 'priority-medium',
          status: 'status-todo',
        },
      ];

      await Promise.all(
        tasksData.map((t) =>
          this.prisma.task.create({
            data: {
              title: t.title,
              description: t.description,
              personId: t.person.id,
              dealId: t.deal.id,
              assigneeId: t.assignee.id,
              dueDate: t.dueDate,
              priorityId: t.priority,
              statusId: t.status,
            },
          })
        )
      );

      return {
        success: true,
        message: 'Test data created successfully',
        summary: {
          companies: 4,
          people: 6,
          deals: 5,
          contacts: 5,
          tasks: 5,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async ensureReferenceData() {
    // Create industries if they don't exist
    const industries = [
      { id: 'ind-technology', name: 'Technology', colour: 'info', sortOrder: 0 },
      { id: 'ind-saas', name: 'SaaS', colour: 'default', sortOrder: 1 },
      { id: 'ind-manufacturing', name: 'Manufacturing', colour: 'secondary', sortOrder: 2 },
      { id: 'ind-finance', name: 'Finance', colour: 'warning', sortOrder: 3 },
      { id: 'ind-energy', name: 'Energy', colour: 'success', sortOrder: 4 },
    ];

    for (const ind of industries) {
      await this.prisma.industry.upsert({
        where: { id: ind.id },
        update: {},
        create: ind,
      });
    }

    // Create deal stages if they don't exist
    const stages = [
      { id: 'stage-lead', name: 'Lead', colour: 'secondary', sortOrder: 0, isDefault: true, outcome: 'OPEN', winChance: 10 },
      { id: 'stage-qualified', name: 'Qualified', colour: 'info', sortOrder: 1, outcome: 'OPEN', winChance: 25 },
      { id: 'stage-proposal', name: 'Proposal', colour: 'warning', sortOrder: 2, outcome: 'OPEN', winChance: 50 },
      { id: 'stage-negotiation', name: 'Negotiation', colour: 'warning', sortOrder: 3, outcome: 'OPEN', winChance: 75 },
      { id: 'stage-won', name: 'Won', colour: 'success', sortOrder: 4, outcome: 'WON', winChance: 100 },
      { id: 'stage-lost', name: 'Lost', colour: 'destructive', sortOrder: 5, outcome: 'LOST', winChance: 0 },
    ];

    for (const stage of stages) {
      await this.prisma.dealStage.upsert({
        where: { id: stage.id },
        update: {},
        create: stage,
      });
    }

    // Create contact types if they don't exist
    const contactTypes = [
      { id: 'type-email', name: 'Email', colour: 'info', sortOrder: 0, icon: 'mail' },
      { id: 'type-call', name: 'Call', colour: 'success', sortOrder: 1, isDefault: true, icon: 'phone' },
      { id: 'type-meeting', name: 'Meeting', colour: 'default', sortOrder: 2, icon: 'users' },
      { id: 'type-note', name: 'Note', colour: 'warning', sortOrder: 3, icon: 'file-text' },
    ];

    for (const type of contactTypes) {
      await this.prisma.contactType.upsert({
        where: { id: type.id },
        update: {},
        create: type,
      });
    }

    // Create task statuses if they don't exist
    const statuses = [
      { id: 'status-todo', name: 'To Do', colour: 'secondary', sortOrder: 0, isDefault: true, isDone: false },
      { id: 'status-in-progress', name: 'In Progress', colour: 'warning', sortOrder: 1, isDone: false },
      { id: 'status-done', name: 'Done', colour: 'success', sortOrder: 2, isDone: true },
    ];

    for (const status of statuses) {
      await this.prisma.taskStatus.upsert({
        where: { id: status.id },
        update: {},
        create: status,
      });
    }

    // Create task priorities if they don't exist
    const priorities = [
      { id: 'priority-low', name: 'Low', colour: 'secondary', sortOrder: 0 },
      { id: 'priority-medium', name: 'Medium', colour: 'info', sortOrder: 1, isDefault: true },
      { id: 'priority-high', name: 'High', colour: 'destructive', sortOrder: 2 },
    ];

    for (const priority of priorities) {
      await this.prisma.taskPriority.upsert({
        where: { id: priority.id },
        update: {},
        create: priority,
      });
    }
  }
}
