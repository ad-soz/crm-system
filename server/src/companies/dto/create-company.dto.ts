import { ArrayUnique, IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  // Industry value ids. The database enforces that unknown or retired ids are
  // refused, and that only one is allowed unless multi-select is switched on.
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  industryIds?: string[];

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;
}
