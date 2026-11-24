import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/require-permissions.decorator';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  // How deals change over time. Read-only, and limited to people who can view deals.
  @Get('deals')
  @RequirePermissions('deals.view')
  deals(@Query('months') months?: string, @Query('ownerId') ownerId?: string) {
    return this.reports.deals(this.reports.parseOptions(months, ownerId));
  }
}
