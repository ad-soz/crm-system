import { IsArray, IsOptional, IsString, ArrayNotEmpty } from 'class-validator';
import { SchemaOp } from '../schema-ops.types';

export class PreviewOpsDto {
  @IsArray()
  @ArrayNotEmpty()
  ops!: SchemaOp[];
}

export class ApplyOpsDto {
  @IsArray()
  @ArrayNotEmpty()
  ops!: SchemaOp[];

  @IsOptional()
  @IsString()
  migrationName!: string;
}
