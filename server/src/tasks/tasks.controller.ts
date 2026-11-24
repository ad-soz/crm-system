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
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/require-permissions.decorator';

@Controller('tasks')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @RequirePermissions('tasks.create')
  create(@Body() dto: CreateTaskDto, @Request() req: any) {
    return this.tasksService.create(dto, req.user.id);
  }

  @Get()
  @RequirePermissions('tasks.view')
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('statusId') statusId?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('dueBefore') dueBefore?: string,
    @Query('dueAfter') dueAfter?: string,
  ) {
    return this.tasksService.findAll(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 100,
      { statusId, assigneeId, dueBefore, dueAfter },
    );
  }

  @Get(':id')
  @RequirePermissions('tasks.view')
  findOne(@Param('id') id: string) {
    return this.tasksService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('tasks.edit')
  update(@Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.tasksService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('tasks.delete')
  remove(@Param('id') id: string) {
    return this.tasksService.remove(id);
  }
}
