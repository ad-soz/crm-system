import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { from, lastValueFrom, Observable } from 'rxjs';
import { AuditService } from './audit.service';

const READ_ONLY = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Names the signed-in user on every change a request makes.
 *
 * The database triggers record what changed; this tells them who did it, for
 * exactly as long as the request runs. Reading is not changing, so GET requests
 * skip it. A request with no signed-in user (signing in) changes nothing.
 */
@Injectable()
export class AuditActorInterceptor implements NestInterceptor {
  constructor(private audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest();
    const userId: string | undefined = req.user?.id;
    if (!userId || READ_ONLY.has(String(req.method).toUpperCase())) return next.handle();
    return from(this.audit.runAs(userId, () => lastValueFrom(next.handle(), { defaultValue: undefined })));
  }
}
