import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { SchemaService } from './schema.service';
import { SchemaEditorService } from './schema-editor.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/require-permissions.decorator';
import { PreviewOpsDto, ApplyOpsDto } from './dto/schema-ops.dto';

@Controller('schema')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SchemaController {
  constructor(
    private readonly schemaService: SchemaService,
    private readonly editorService: SchemaEditorService,
  ) {}

  @Get('erd')
  @RequirePermissions('datamodel.view')
  getErd() {
    return this.schemaService.getErd();
  }

  // Tells the client whether schema editing is switched on.
  @Get('capabilities')
  @RequirePermissions('datamodel.view')
  getCapabilities() {
    return { editingEnabled: this.editorService.isEnabled() };
  }

  @Post('preview')
  @RequirePermissions('datamodel.edit')
  preview(@Body() dto: PreviewOpsDto) {
    return this.editorService.preview(dto.ops);
  }

  @Post('apply')
  @RequirePermissions('datamodel.edit')
  apply(@Body() dto: ApplyOpsDto) {
    return this.editorService.apply(dto.ops, dto.migrationName);
  }
}
