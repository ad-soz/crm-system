import { Controller, Post } from '@nestjs/common';
import { InitService } from './init.service';

/**
 * One-time initialization endpoint. Creates a default admin user if none exists.
 * This runs automatically on first deploy and is safe to call multiple times
 * (subsequent calls do nothing if users already exist).
 */
@Controller('init')
export class InitController {
  constructor(private readonly initService: InitService) {}

  @Post('setup')
  async setup() {
    return this.initService.ensureDefaultAdmin();
  }
}
