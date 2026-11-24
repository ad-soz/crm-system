import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { COLOURS, ICONS, STAGE_OUTCOMES } from '../reference-data.config';

export class CreateReferenceValueDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @IsOptional()
  @IsIn(COLOURS)
  colour?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  // Extra attributes; only the ones relevant to the list are read.
  @IsOptional()
  @IsIn(STAGE_OUTCOMES)
  outcome?: string;

  // Chance of winning a deal in this stage, as a percentage.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  winChance?: number;

  @IsOptional()
  @IsBoolean()
  isDone?: boolean;

  @IsOptional()
  @IsIn(ICONS)
  icon?: string;
}

export class UpdateReferenceValueDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsIn(COLOURS)
  colour?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsIn(STAGE_OUTCOMES)
  outcome?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  winChance?: number;

  @IsOptional()
  @IsBoolean()
  isDone?: boolean;

  @IsOptional()
  @IsIn(ICONS)
  icon?: string;
}

export class ReorderDto {
  @IsString({ each: true })
  ids!: string[];
}

export class SetMultipleDto {
  @IsBoolean()
  allowMultiple!: boolean;
}

export class SetDefaultDto {
  // null clears the default (only allowed for optional lists).
  @IsOptional()
  @IsString()
  valueId?: string | null;
}

export class ReorderParamDto {
  @IsInt()
  @IsOptional()
  _unused?: number;
}
