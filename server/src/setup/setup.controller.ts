import { Controller, Post } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from '../auth/passwords';
import { ADMINISTRATOR_PROFILE_ID, SALES_REP_PROFILE_ID } from '../permissions/permissions';

@Controller('setup')
export class SetupController {
  constructor(private prisma: PrismaService) {}

  /**
   * One-time setup endpoint. Creates default admin and rep users.
   * Visit: POST https://your-app.com/setup/create-users
   * This is intentionally simple and visible for debugging.
   */
  @Post('create-users')
  async createUsers() {
    try {
      const adminPassword = process.env.ADMIN_PASSWORD || '1234567890A!';
      const repPassword = process.env.REP_PASSWORD || '1234567890A!';

      // Check if users already exist
      const existingAdmin = await this.prisma.user.findUnique({
        where: { email: 'admin@crm.com' },
      });

      if (existingAdmin) {
        return {
          success: true,
          message: 'Admin user already exists',
          email: 'admin@crm.com',
        };
      }

      // Create admin
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

      // Create rep
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
        success: true,
        message: 'Users created successfully',
        admin: {
          email: admin.email,
          password: adminPassword,
        },
        rep: {
          email: rep.email,
          password: repPassword,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

