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
import { PeopleService } from './people.service';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/require-permissions.decorator';

@Controller('people')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PeopleController {
  constructor(private readonly peopleService: PeopleService) {}

  @Post()
  @RequirePermissions('people.create')
  create(@Body() dto: CreatePersonDto, @Request() req: any) {
    return this.peopleService.create(dto, req.user.id);
  }

  @Get()
  @RequirePermissions('people.view')
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.peopleService.findAll(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
      search,
      companyId,
    );
  }

  // Suggestions for the free-text job title field.
  @Get('meta/titles')
  @RequirePermissions('people.view')
  titleSuggestions(@Query('q') q?: string) {
    return this.peopleService.titleSuggestions(q ?? '');
  }

  @Get(':id')
  @RequirePermissions('people.view')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.peopleService.findOne(id, req.user.permissions);
  }

  @Patch(':id')
  @RequirePermissions('people.edit')
  update(@Param('id') id: string, @Body() dto: UpdatePersonDto) {
    return this.peopleService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('people.delete')
  remove(@Param('id') id: string) {
    return this.peopleService.remove(id);
  }
}
