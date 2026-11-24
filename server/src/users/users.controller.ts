import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignProfileDto, InviteUserDto } from './dto/invite-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/require-permissions.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions('users.manage')
  async findAll(@Request() req: any) {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    return this.usersService.findAll(page, limit);
  }

  // Accounts are created by invitation only.
  @Post()
  @RequirePermissions('users.manage')
  async invite(@Body() dto: InviteUserDto, @Request() req: any) {
    return this.usersService.invite(dto, req.user);
  }

  @Post(':id/reset-password')
  @RequirePermissions('users.manage')
  @HttpCode(200)
  async resetPassword(@Param('id') id: string, @Request() req: any) {
    return this.usersService.resetPassword(id, req.user);
  }

  @Patch(':id/profile')
  @RequirePermissions('users.manage')
  async assignProfile(@Param('id') id: string, @Body() dto: AssignProfileDto, @Request() req: any) {
    return this.usersService.assignProfile(id, dto.roleProfileId, req.user);
  }

  // Anyone can edit their own name and email; editing others needs users.manage.
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto, @Request() req: any) {
    if (id !== req.user.id && !req.user.permissions.includes('users.manage')) {
      throw new ForbiddenException('You can only update your own profile');
    }
    return this.usersService.update(id, dto, req.user);
  }
}
