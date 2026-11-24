import {
  Controller,
  Get,
  Post,
  Res,
  Request,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ParseFilePipe,
  MaxFileSizeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ImportExportService } from './import-export.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/require-permissions.decorator';
import { AuditService } from '../audit/audit.service';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ImportExportController {
  constructor(
    private readonly service: ImportExportService,
    private readonly audit: AuditService,
  ) {}

  @Get('export/people')
  @RequirePermissions('data.export', 'people.view')
  async exportPeople(@Res() res: Response, @Request() req: any) {
    const csv = await this.service.exportPeople();
    await this.audit.event('export', { actorId: req.user.id, entity: 'people', detail: 'Exported all people to CSV' });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="people.csv"');
    res.send(csv);
  }

  @Post('import/people')
  @RequirePermissions('data.import', 'people.create')
  @UseInterceptors(FileInterceptor('file'))
  async importPeople(
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 })],
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
    @Request() req: any,
  ) {
    if (!file.originalname.toLowerCase().endsWith('.csv')) {
      throw new BadRequestException('Only .csv files are accepted');
    }
    return this.service.importPeople(file.buffer, req.user.id, {
      canCreateCompanies: req.user.permissions.includes('companies.create'),
    });
  }
}
