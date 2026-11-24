import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from '../auth/passwords';
import { ADMINISTRATOR_PROFILE_ID, SALES_REP_PROFILE_ID } from '../permissions/permissions';

@Injectable()
export class InitService {
  constructor(private prisma: PrismaService) {}

  async ensureDefaultAdmin() {
    // Check if any users exist
    const userCount = await this.prisma.user.count();
    if (userCount > 0) {
      return { message: 'Database already initialized', usersExist: true };
    }

    // Get passwords from env or use defaults
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@1234567890';
    const repPassword = process.env.REP_PASSWORD || 'Rep@1234567890';

    try {
      // Create admin user
      const admin = await this.prisma.user.create({
        data: {
          email: 'admin@crm.com',
          passwordHash: await hashPassword(adminPassword),
          mustChangePassword: false,
          firstName: 'Admin',
          lastName: 'User',
          roleProfileId: ADMINISTRATOR_PROFILE_ID,
        },
      });

      // Create sales rep user
      const rep = await this.prisma.user.create({
        data: {
          email: 'rep@crm.com',
          passwordHash: await hashPassword(repPassword),
          mustChangePassword: false,
          firstName: 'Sales',
          lastName: 'Rep',
          roleProfileId: SALES_REP_PROFILE_ID,
        },
      });

      return {
        message: 'Default users created successfully',
        admin: admin.email,
        rep: rep.email,
        usersExist: false,
      };
    } catch (error) {
      return {
        message: 'Failed to create default users',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
