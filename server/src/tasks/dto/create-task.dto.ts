import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  // Task status / priority value ids. Omitted means the list default.
  @IsOptional()
  @IsString()
  statusId?: string;

  @IsOptional()
  @IsString()
  priorityId?: string;

  @IsOptional()
  @IsString()
  personId?: string;

  @IsOptional()
  @IsString()
  dealId?: string;

  @IsOptional()
  @IsString()
  assigneeId?: string;

  // The Contact (touchpoint, such as an email or call) this task follows up.
  // null clears the link when editing a task.
  @IsOptional()
  @IsString()
  contactId?: string | null;
}
