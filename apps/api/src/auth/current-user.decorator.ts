import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

export interface AuthUser {
  id: string;
  role: string;
  sessionId?: string;
  /** Set when authenticated via an API key. */
  apiKeyId?: string;
  scopes?: string[];
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest();
    return req.user as AuthUser;
  },
);
