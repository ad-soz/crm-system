import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/require-permissions.decorator';
import { ReferenceDataService } from './reference-data.service';
import {
  CreateReferenceValueDto,
  ReorderDto,
  SetMultipleDto,
  UpdateReferenceValueDto,
} from './dto/reference-value.dto';

@Controller('reference')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReferenceDataController {
  constructor(private readonly ref: ReferenceDataService) {}

  // Readable by anyone signed in: forms need the lists to show their options.
  @Get('catalog')
  catalog() {
    return this.ref.catalog();
  }

  @Get(':key')
  list(@Param('key') key: string) {
    return this.ref.list(key);
  }

  // Everything that changes a list needs the reference.manage permission.
  @Post(':key')
  @RequirePermissions('reference.manage')
  create(@Param('key') key: string, @Body() dto: CreateReferenceValueDto) {
    return this.ref.create(key, dto);
  }

  @Patch(':key/order')
  @RequirePermissions('reference.manage')
  reorder(@Param('key') key: string, @Body() dto: ReorderDto) {
    return this.ref.reorder(key, dto.ids);
  }

  @Put(':key/multiple')
  @RequirePermissions('reference.manage')
  setMultiple(@Param('key') key: string, @Body() dto: SetMultipleDto) {
    return this.ref.setMultiple(key, dto.allowMultiple);
  }

  @Patch(':key/:id')
  @RequirePermissions('reference.manage')
  update(@Param('key') key: string, @Param('id') id: string, @Body() dto: UpdateReferenceValueDto) {
    return this.ref.update(key, id, dto);
  }

  @Delete(':key/:id')
  @RequirePermissions('reference.manage')
  remove(@Param('key') key: string, @Param('id') id: string) {
    return this.ref.remove(key, id);
  }
}
