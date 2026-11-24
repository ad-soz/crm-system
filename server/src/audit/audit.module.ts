import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditActorInterceptor } from './audit.interceptor';

/** Global so that any part of the app can record an event without wiring. */
@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService, { provide: APP_INTERCEPTOR, useClass: AuditActorInterceptor }],
  exports: [AuditService],
})
export class AuditModule {}
