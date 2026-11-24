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
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/require-permissions.decorator';

@Controller('contacts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Post()
  @RequirePermissions('contacts.create')
  create(@Body() dto: CreateContactDto, @Request() req: any) {
    return this.contactsService.create(dto, req.user.id);
  }

  @Get()
  @RequirePermissions('contacts.view')
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('personId') personId?: string,
    @Query('dealId') dealId?: string,
    @Query('typeId') typeId?: string,
  ) {
    return this.contactsService.findAll(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 50,
      personId,
      dealId,
      typeId,
    );
  }

  @Get(':id')
  @RequirePermissions('contacts.view')
  findOne(@Param('id') id: string) {
    return this.contactsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('contacts.edit')
  update(@Param('id') id: string, @Body() dto: UpdateContactDto) {
    return this.contactsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('contacts.delete')
  remove(@Param('id') id: string) {
    return this.contactsService.remove(id);
  }
}
