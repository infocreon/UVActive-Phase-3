import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateSensorDto {
  @IsString() name!: string;
  @IsString() sensorId!: string;
  @IsOptional() @IsString() note?: string;
}

// Admin-side bulk registration: one shared name + note, with a
// comma-separated list of hardware IDs ("12345,12346, 12347") expanded
// into one Sensor row per ID — same outcome as the Branch Portal's
// one-at-a-time form, just N rows in one submission. IDs are trimmed of
// whitespace and de-duplicated server-side; entries that already exist
// at the gym are skipped (reported back, not an error) so a partially
// pasted list can simply be re-submitted.
export class BulkCreateSensorsDto {
  @IsString() name!: string;
  @IsString() sensorIds!: string;
  @IsOptional() @IsString() note?: string;
}

export class UpdateSensorDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() sensorId?: string;
  @IsOptional() @IsString() note?: string;
}

export class UpsertTelemetryDto {
  @IsOptional() @IsInt() @Min(0) @Max(100) batteryPct?: number;
  @IsIn(['connected', 'reconnecting', 'disconnected']) connectionState!: 'connected' | 'reconnecting' | 'disconnected';
  @IsOptional() @IsString() sessionId?: string;
}
