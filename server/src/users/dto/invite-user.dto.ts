import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class InviteUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @IsString()
  @IsNotEmpty()
  roleProfileId!: string;
}

export class AssignProfileDto {
  @IsString()
  @IsNotEmpty()
  roleProfileId!: string;
}
