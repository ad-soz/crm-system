import { IsOptional, IsString, IsNotEmpty } from 'class-validator';

// Type and associations are immutable after creation; only subject/description can change.
export class UpdateContactDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  subject?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
