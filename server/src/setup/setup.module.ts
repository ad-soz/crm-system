import { Module } from '@nestjs/common';
import { SetupController } from './setup.controller';
import { SeedDataController } from './seed-data.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SetupController, SeedDataController],
})
export class SetupModule {}
