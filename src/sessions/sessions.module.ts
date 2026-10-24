import { Module } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { SessionsReassignmentJob } from './sessions.reassignment.job';
import { SensorReadingsRetentionJob } from './sensor-readings-retention.job';
import { AbandonedSessionsJob } from './abandoned-sessions.job';
import { TrainerSessionsController, BranchSessionsController, MemberSessionsController, AdminSessionsController } from './sessions.controller';
import { TrainerMemberHistoryController } from './history-ticks.controller';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SensorsModule } from '../sensors/sensors.module';

@Module({
  imports: [AuditLogModule, NotificationsModule, SensorsModule],
  providers: [SessionsService, SessionsReassignmentJob, SensorReadingsRetentionJob, AbandonedSessionsJob],
  controllers: [TrainerSessionsController, BranchSessionsController, MemberSessionsController, AdminSessionsController, TrainerMemberHistoryController],
  exports: [SessionsService],
})
export class SessionsModule {}
