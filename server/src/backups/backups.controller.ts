import { ConflictException, Controller, Get, InternalServerErrorException, Post, Request, UseGuards } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/require-permissions.decorator';
import { BackupsService } from './backups.service';

@Controller('backups')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BackupsController {
  constructor(
    private readonly backups: BackupsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('backups.manage')
  async list() {
    return { backups: await this.backups.list(), status: this.backups.status() };
  }

  @Post()
  @RequirePermissions('backups.manage')
  async create(@Request() req: any) {
    if (this.backups.status().running) throw new ConflictException('A backup is already running. Try again in a moment.');
    try {
      const made = await this.backups.create('manual');
      await this.audit.event('backup', { actorId: req.user.id, entity: 'backups', detail: 'Made a backup on demand' });
      return made;
    } catch (err) {
      // The detail is in the server log and in the status shown in Settings.
      throw new InternalServerErrorException('The backup could not be completed. See the status in Settings.');
    }
  }
}
