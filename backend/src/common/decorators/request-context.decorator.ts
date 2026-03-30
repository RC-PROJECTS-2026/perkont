import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const RequestContext = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return {
      ipAddress: request.ip || request.headers['x-forwarded-for'] || request.connection?.remoteAddress,
      deviceInfo: request.headers['user-agent'] || '',
      sessionId: request.headers['x-session-id'] || '',
    };
  },
);

export interface RequestCtx {
  ipAddress: string;
  deviceInfo: string;
  sessionId: string;
}
