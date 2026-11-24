import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ensureGuards } from '../reference-data/guards';
import { ensureAuditTriggers } from '../audit/audit-triggers';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    // Prisma drops a table's triggers when a migration recreates the table.
    // Make sure every database rule exists before the app accepts requests.
    const { created } = await ensureGuards(this);
    if (created.length) {
      this.logger.warn(`Restored ${created.length} missing database rule(s): ${created.join(', ')}`);
    }
    // The history is written by triggers built from the tables as they are now.
    const audit = await ensureAuditTriggers(this);
    if (audit.skipped) {
      this.logger.warn('The audit log tables do not exist yet (the database update has not been applied); auditing is not switched on.');
    } else {
      if (audit.changed) this.logger.log(`Audit triggers brought up to date (${audit.changed} change(s))`);
      // A request that was cut off could have left a name behind; nobody is acting at start-up.
      await this.$executeRawUnsafe('DELETE FROM audit_actor');
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
