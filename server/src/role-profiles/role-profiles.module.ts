import { Module } from '@nestjs/common';
import { RoleProfilesController } from './role-profiles.controller';
import { RoleProfilesService } from './role-profiles.service';

@Module({
  controllers: [RoleProfilesController],
  providers: [RoleProfilesService],
})
export class RoleProfilesModule {}
