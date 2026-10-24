import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SessionsService } from './sessions.service';

/**
 * Closes sessions that were genuinely run but never received an end
 * request — the phone was killed, its offline outbox lost the
 * `session_end`, or the device was wiped. See
 * SessionsService.reconcileAbandonedSessions() for why the stored sensor
 * readings are the authoritative clock and result source.
 *
 * Hourly rather than daily: until this runs, a finished workout keeps
 * appearing in the trainer's *schedule* (instead of past history) on
 * every device, with no leaderboard. One extra hour of that is already
 * one too many; the six-hour grace period inside the service is what
 * protects a session that is still live or paused, not the frequency.
 */
@Injectable()
export class AbandonedSessionsJob {
  private readonly logger = new Logger(AbandonedSessionsJob.name);

  constructor(private readonly sessions: SessionsService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handle() {
    const result = await this.sessions.reconcileAbandonedSessions();
    if (result.closed > 0) {
      this.logger.log(
        `Auto-closed ${result.closed} abandoned session(s) from their stored readings: ${result.sessions.join(', ')}`,
      );
    }
  }
}
