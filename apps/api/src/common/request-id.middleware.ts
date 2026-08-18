import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** Assigns/propagates a request id for tracing (spec §43). */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header('x-request-id');
    const id = incoming && incoming.length <= 128 ? incoming : randomUUID();
    (req as Request & { id: string }).id = id;
    res.setHeader('x-request-id', id);
    next();
  }
}
