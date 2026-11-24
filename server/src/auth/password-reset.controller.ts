import { Controller, Post, Body } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from './passwords';

@Controller('auth/password-reset')
export class PasswordResetController {
  constructor(private prisma: PrismaService) {}

  /**
   * Emergency password reset (no auth required).
   * For recovery/debugging only. Should be removed or gated behind a secret in production.
   * POST /auth/password-reset/emergency
   * Body: { email: "admin@crm.com", newPassword: "NewPassword123!" }
   */
  @Post('emergency')
  async emergencyReset(@Body() dto: { email: string; newPassword: string }) {
    try {
      const { email, newPassword } = dto;

      if (!email || !newPassword) {
        return {
          success: false,
          error: 'Email and newPassword are required',
        };
      }

      if (newPassword.length < 10) {
        return {
          success: false,
          error: 'Password must be at least 10 characters',
        };
      }

      // Find user
      const user = await this.prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (!user) {
        return {
          success: false,
          error: `No account found for ${email}`,
        };
      }

      // Update password
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await hashPassword(newPassword),
          mustChangePassword: false,
          passwordChangedAt: new Date(),
        },
      });

      return {
        success: true,
        message: `Password reset for ${email}. You can now sign in with the new password.`,
        email,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
