import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, CurrentUser, AuthenticatedUser } from '../common/decorators/auth.decorator';
import { SensorsService } from './sensors.service';
import { BulkCreateSensorsDto, CreateSensorDto, UpdateSensorDto, UpsertTelemetryDto } from './sensors.dto';

@ApiTags('branch/sensors')
@Controller('branch/sensors')
@Auth('staff', ['branch_manager'])
export class BranchSensorsController {
  constructor(private readonly sensors: SensorsService) {}

  // Read-only list for trainers too — the Trainer App's session setup
  // uses it to show the real sensor-slot cap client-side. The inventory
  // itself (names + ids of this branch's straps) is no more sensitive
  // than what trainers already see via /trainer/sensors/telemetry, and
  // capacity is still enforced server-side regardless. Create/update/
  // delete below remain branch_manager-only.
  @Auth('staff', ['branch_manager', 'trainer'])
  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.sensors.listForGym(user.gymId!);
  }

  @Get('telemetry')
  telemetry(@CurrentUser() user: AuthenticatedUser) {
    return this.sensors.listTelemetryForGym(user.gymId!);
  }

  @Post()
  create(@Body() dto: CreateSensorDto, @CurrentUser() user: AuthenticatedUser) {
    return this.sensors.create(user.gymId!, dto, user.sub);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSensorDto, @CurrentUser() user: AuthenticatedUser) {
    return this.sensors.update(id, user.gymId!, dto, user.sub);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.sensors.delete(id, user.gymId!, user.sub);
  }
}

// ── Trainer App — live telemetry reporting + pre-flight read ───────
// Separate from BranchSensorsController: a trainer has no permission
// to create/edit/delete the gym's sensor inventory, only to report
// live status for sensors that already exist, and to read that status
// back for the pre-session checklist.
@ApiTags('trainer/sensors')
@Controller('trainer/sensors')
@Auth('staff', ['trainer', 'branch_manager'])
export class TrainerSensorsController {
  constructor(private readonly sensors: SensorsService) {}

  @Get('telemetry')
  telemetry(@CurrentUser() user: AuthenticatedUser) {
    return this.sensors.listTelemetryForGym(user.gymId!);
  }

  @Post(':sensorId/telemetry')
  reportTelemetry(@Param('sensorId') sensorId: string, @Body() dto: UpsertTelemetryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.sensors.upsertTelemetry(user.gymId!, sensorId, dto);
  }
}

@ApiTags('admin/sensors')
@Controller('admin/sensors')
@Auth('admin')
export class AdminSensorsController {
  constructor(private readonly sensors: SensorsService) {}

  @Get()
  listAll() {
    return this.sensors.listAllForAdmin();
  }

  // Bulk registration for any gym — the admin-side equivalent of the
  // Branch Portal's "Add Sensor" form: one shared name + a
  // comma-separated list of sensor IDs, expanded to one row per ID.
  // The gym is chosen in the UI (path param), matching how the branch
  // version is implicitly scoped to the signed-in manager's gym.
  @Post('gyms/:gymId/bulk')
  bulkCreate(@Param('gymId') gymId: string, @Body() dto: BulkCreateSensorsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.sensors.bulkCreateForAdmin(gymId, dto, user.sub);
  }

  // Remove any sensor row by id (platform-wide, any gym).
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.sensors.deleteForAdmin(id, user.sub);
  }
}
