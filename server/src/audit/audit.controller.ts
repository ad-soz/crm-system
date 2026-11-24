import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/require-permissions.decorator';
import { AuditService } from './audit.service';

@Controller('audit')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('audit.view')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  async list(
    @Query('entity') entity?: string,
    @Query('recordId') recordId?: string,
    @Query('actorId') actorId?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const num = (v?: string) => (v && /^\d+$/.test(v) ? parseInt(v, 10) : undefined);
    const [result, since] = await Promise.all([
      this.audit.list({ entity, recordId, actorId, action, from, to, page: num(page), limit: num(limit) }),
      this.audit.since(),
    ]);
    return { ...result, since };
  }

  /** People who appear in the log, for the filter. */
  @Get('actors')
  actors() {
    return this.audit.actors();
  }

  /** Record types that appear in the log, for the filter. */
  @Get('entities')
  entities() {
    return this.audit.entities();
  }
}
