import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, CurrentUser } from '../common/decorators/auth.decorator';
import { AuthenticatedUser } from '../common/decorators/auth.decorator';
import { SessionsService } from './sessions.service';

// ── Trainer App — member cross-session HR history ──────────────────────
// Separate controller so an admin-level route registration doesn't
// accidentally expose this gym-scoped endpoint under the admin namespace.
@ApiTags('trainer/members')
@Controller('trainer/members')
@Auth('staff', ['trainer', 'branch_manager'])
export class TrainerMemberHistoryController {
  constructor(private readonly sessions: SessionsService) {}

  @Get(':memberId/history-ticks')
  getMemberHistoryTicks(@Param('memberId') memberId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.sessions.getMemberHistoryTicks(memberId, user.gymId!);
  }

  @Get(':memberId/hr-ticks')
  getMemberHrTicks(@Param('memberId') memberId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.sessions.getMemberHistoryTicks(memberId, user.gymId!);
  }
}
