import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: string;
  path?: string;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => {
        // StreamableFile (PDF, dosya indirme) ise sarmala
        if (data instanceof StreamableFile) {
          return data as any;
        }
        return {
          success: true,
          data,
          timestamp: new Date().toISOString(),
          path: context.switchToHttp().getRequest().url,
        };
      }),
    );
  }
}
