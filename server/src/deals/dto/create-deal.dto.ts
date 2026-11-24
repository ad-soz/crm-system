import { IsNotEmpty, IsNumber, IsOptional, IsString, IsDateString, Min } from 'class-validator';

export class CreateDealDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsNumber()
  @Min(0)
  amount!: number;

  // A deal stage value id. Omitted means the default stage. Unknown ids are
  // refused by the database foreign key.
  @IsOptional()
  @IsString()
  stageId?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  personId?: string;

  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @IsDateString()
  expectedCloseDate?: string;
}
