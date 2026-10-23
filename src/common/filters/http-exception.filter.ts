import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { AppException } from '../exceptions/app.exception';

// Fallback codes for the standard Nest exceptions thrown all over the
// codebase that AREN'T one of the spec-named AppException cases — this
// is what guarantees §14's promise that clients can always match on
// `error.code`, never on message text, even for a plain NotFoundException.
const STATUS_TO_GENERIC_CODE: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_ERROR',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const isPrismaKnown = exception instanceof Prisma.PrismaClientKnownRequestError;

    let status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string;
    let message: string;

    if (exception instanceof AppException) {
      code = exception.code;
      message = (exception.getResponse() as any).message;
    } else if (isHttp) {
      const body = exception.getResponse();
      code = STATUS_TO_GENERIC_CODE[status] || 'ERROR';
      message = typeof body === 'string' ? body : (body as any).message || 'Request failed.';
      // class-validator's ValidationPipe returns message as a string[] — flatten for a stable shape.
      if (Array.isArray(message)) message = message.join(' ');
    } else if (isPrismaKnown) {
      // Safety net for any create/update path that doesn't (or can't,
      // due to a race) pre-check a unique constraint itself — e.g. two
      // concurrent requests both passing a pre-emptive duplicate check
      // before either has committed (TOCTOU). Without this, any such
      // path bubbles up as an unhandled 500 "Internal server error"
      // instead of a client-actionable 409/404/400.
      ({ status, code, message } = this.mapPrismaError(exception));
    } else {
      code = 'INTERNAL_ERROR';
      message = 'Internal server error';
    }

    // ── Structured instance log for EVERY failure ─────────────────────
    // 4xx are client-actionable and expected in normal operation → warn
    // (with the offending request context so operators can trace which
    // call failed and why). Everything else (5xx, Prisma faults, unknown
    // throwables) is a genuine server-side defect → error with the full
    // stack so it shows up in the platform's log stream immediately.
    const logLine = `${req.method} ${req.originalUrl ?? req.url} -> ${status} ${code}: ${message}`;
    if (status >= 500) {
      this.logger.error(logLine, exception instanceof Error ? exception.stack : String(exception));
    } else {
      this.logger.warn(logLine);
    }

    res.status(status).json({ success: false, error: { code, message }, path: req.url });
  }

  private mapPrismaError(exception: Prisma.PrismaClientKnownRequestError): { status: number; code: string; message: string } {
    const target = (exception.meta?.target as string[] | string | undefined);
    const fields = Array.isArray(target) ? target.join(', ') : target;

    switch (exception.code) {
      case 'P2002': // Unique constraint violation
        return {
          status: HttpStatus.CONFLICT,
          code: 'CONFLICT',
          message: fields ? `A record with this ${fields} already exists.` : 'A record with these details already exists.',
        };
      case 'P2025': // Record not found (update/delete target, or a required relation)
        return {
          status: HttpStatus.NOT_FOUND,
          code: 'NOT_FOUND',
          message: 'The requested record was not found.',
        };
      case 'P2003': // Foreign key constraint failed
        return {
          status: HttpStatus.BAD_REQUEST,
          code: 'BAD_REQUEST',
          message: fields ? `Invalid reference: related ${fields} does not exist.` : 'Invalid reference to a related record.',
        };
      default:
        this.logger.error(`Unhandled Prisma error ${exception.code}: ${exception.message}`);
        return { status: HttpStatus.INTERNAL_SERVER_ERROR, code: 'INTERNAL_ERROR', message: 'Internal server error' };
    }
  }
}
