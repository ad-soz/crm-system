import { Body, Controller, Delete, Get, Put, Request, UseGuards } from '@nestjs/common';
import { AppearanceService } from './appearance.service';
import { ThemePrefsDto } from './dto/theme-prefs.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AllowPendingPassword } from '../auth/decorators/allow-pending-password.decorator';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/require-permissions.decorator';

// Responses are always wrapped as { theme } so "not set" is an explicit null
// rather than an empty response body.
@Controller('appearance')
export class AppearanceController {
  constructor(private readonly appearance: AppearanceService) {}

  // Public: the login page uses the organisation theme before anyone signs in.
  // It only exposes colour/font choices, nothing sensitive.
  @Get('org')
  async getOrg() {
    return { theme: await this.appearance.getOrg() };
  }

  @Put('org')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('appearance.manage')
  async setOrg(@Body() dto: ThemePrefsDto) {
    return { theme: await this.appearance.setOrg(dto) };
  }

  @Delete('org')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('appearance.manage')
  async clearOrg() {
    await this.appearance.clearOrg();
    return { theme: null };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @AllowPendingPassword()
  async getMine(@Request() req: any) {
    return { theme: await this.appearance.getMine(req.user.id) };
  }

  @Put('me')
  @UseGuards(JwtAuthGuard)
  async setMine(@Request() req: any, @Body() dto: ThemePrefsDto) {
    return { theme: await this.appearance.setMine(req.user.id, dto) };
  }

  @Delete('me')
  @UseGuards(JwtAuthGuard)
  async clearMine(@Request() req: any) {
    await this.appearance.clearMine(req.user.id);
    return { theme: null };
  }
}
