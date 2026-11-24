import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CreateDealDto } from './create-deal.dto';

export class UpdateDealDto extends PartialType(CreateDealDto) {
  /**
   * Why the deal is moving to another stage. Required whenever stageId changes
   * (checked in the service and, as a backstop, by the database), and ignored
   * otherwise. It is saved in the deal's stage history, not on the deal.
   */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  stageComment?: string;
}
