import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class AuditContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    request.auditContext = {
      ipAddress: request.ip || request.headers['x-forwarded-for'] || '',
      deviceInfo: request.headers['user-agent'] || '',
    };
    return next.handle();
  }
}
