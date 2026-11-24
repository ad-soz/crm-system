import { IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';

export class CreateContactDto {
  // A contact type value id. Omitted means the default type.
  @IsOptional()
  @IsString()
  typeId?: string;

  @IsString()
  @IsNotEmpty()
  subject!: string;

  @IsOptional()
  @IsString()
  description?: string;

  // At least one of personId / dealId must be present.
  // ValidateIf makes personId required when dealId is absent.
  @ValidateIf((o) => !o.dealId)
  @IsString()
  @IsNotEmpty({ message: 'At least one of personId or dealId is required' })
  personId?: string;

  @IsOptional()
  @IsString()
  dealId?: string;
}
