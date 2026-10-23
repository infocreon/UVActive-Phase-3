import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

/**
 * Global request log — one line per request on the backend instance:
 *
 *   [RequestLogger] POST /api/v1/admin/gyms 201 42ms admin:usr_01H...
 *   [RequestLogger] GET /api/v1/branch/members 500 118ms admin:usr_01H... FAILED
 *
 * Failures are additionally mirrored through Logger.error so they stand
 * out in the platform log stream (the exception filter owns the detailed
 * error payload + stack; this interceptor owns the timing + who made the
 * call). Failed lines always carry the FAILED marker so a simple grep
 * finds every problem request:
 *
 *   grep FAILED logs.txt
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('RequestLogger');
  private readonly startTimes = new WeakMap<object, number>();

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    this.startTimes.set(req, Date.now());

    const res = http.getResponse<Response>();

    return next.handle().pipe(
      tap({
        next: () => {
          // res.statusCode is already final here for successful responses
          this.emit(req, res, false);
        },
        error: () => {
          // For errors the exception filter runs after us and sets the
          // real status; read it now that it has been applied.
          this.emit(req, res, true);
        },
      }),
    );
  }

  private emit(req: Request, res: Response, failed: boolean) {
    const durationMs = Date.now() - (this.startTimes.get(req) ?? Date.now());
    const actor = (req as Request & { user?: { sub?: string; role?: string } }).user;
    const actorLabel = actor?.sub ? ` ${actor.role ?? 'user'}:${actor.sub}` : '';
    const line = `${req.method} ${req.originalUrl ?? req.url} ${res.statusCode} ${durationMs}ms${actorLabel}${failed ? ' FAILED' : ''}`;
    if (failed) {
      this.logger.error(line);
    } else if (res.statusCode >= 400) {
      this.logger.warn(line);
    } else {
      this.logger.log(line);
    }
  }
}
