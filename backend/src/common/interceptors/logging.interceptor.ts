import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, user } = request;
    const now = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse();
          this.logger.info(`${method} ${url} ${response.statusCode}`, {
            method,
            url,
            statusCode: response.statusCode,
            duration: `${Date.now() - now}ms`,
            userId: user?.id,
          });
        },
        error: (error) => {
          this.logger.warn(`${method} ${url} ERROR`, {
            method,
            url,
            error: error.message,
            duration: `${Date.now() - now}ms`,
            userId: user?.id,
          });
        },
      }),
    );
  }
}
