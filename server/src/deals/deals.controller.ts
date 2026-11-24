import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { DealsService } from './deals.service';
import { CreateDealDto } from './dto/create-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/require-permissions.decorator';

@Controller('deals')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DealsController {
  constructor(private readonly dealsService: DealsService) {}

  @Post()
  @RequirePermissions('deals.create')
  create(@Body() dto: CreateDealDto, @Request() req: any) {
    return this.dealsService.create(dto, req.user.id);
  }

  @Get()
  @RequirePermissions('deals.view')
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('stageId') stageId?: string,
    @Query('ownerId') ownerId?: string,
  ) {
    return this.dealsService.findAll(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 100,
      stageId,
      ownerId,
    );
  }

  @Get('pipeline')
  @RequirePermissions('deals.view')
  pipeline() {
    return this.dealsService.pipeline();
  }

  @Get(':id')
  @RequirePermissions('deals.view')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.dealsService.findOne(id, req.user.permissions);
  }

  // Stage moves: who moved the deal, when, from where to where, and why.
  @Get(':id/history')
  @RequirePermissions('deals.view')
  history(@Param('id') id: string) {
    return this.dealsService.history(id);
  }

  @Patch(':id')
  @RequirePermissions('deals.edit')
  update(@Param('id') id: string, @Body() dto: UpdateDealDto, @Request() req: any) {
    return this.dealsService.update(id, dto, req.user);
  }

  @Delete(':id')
  @RequirePermissions('deals.delete')
  remove(@Param('id') id: string) {
    return this.dealsService.remove(id);
  }
}
