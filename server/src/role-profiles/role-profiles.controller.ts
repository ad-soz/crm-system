import { Body, Controller, Delete, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../permissions/require-permissions.decorator';
import { RoleProfilesService } from './role-profiles.service';
import { CreateRoleProfileDto, UpdateRoleProfileDto } from './dto/role-profile.dto';

@Controller('role-profiles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RoleProfilesController {
  constructor(private readonly profiles: RoleProfilesService) {}

  // Readable by user managers too, so they can pick a profile when inviting.
  @Get('catalog')
  @RequireAnyPermission('profiles.manage', 'users.manage')
  catalog() {
    return this.profiles.catalog();
  }

  @Get()
  @RequireAnyPermission('profiles.manage', 'users.manage')
  list() {
    return this.profiles.list();
  }

  @Post()
  @RequirePermissions('profiles.manage')
  create(@Body() dto: CreateRoleProfileDto, @Request() req: any) {
    return this.profiles.create(dto, req.user);
  }

  @Patch(':id')
  @RequirePermissions('profiles.manage')
  update(@Param('id') id: string, @Body() dto: UpdateRoleProfileDto, @Request() req: any) {
    return this.profiles.update(id, dto, req.user);
  }

  @Delete(':id')
  @RequirePermissions('profiles.manage')
  remove(@Param('id') id: string) {
    return this.profiles.remove(id);
  }
}
