import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, CurrentUser, AuthenticatedUser } from '../common/decorators/auth.decorator';
import { UploadsService } from './uploads.service';
import { PresignPhotoDto } from './uploads.dto';

// Presigned-upload endpoints only — the actual image bytes go straight
// from the client to the bucket (see UploadsService), never through
// this API process. Each route is scoped to "upload a photo of myself"
// — a member/trainer can only ever get a presigned key for their own
// photo, keyed off their own JWT subject, never an id from the request
// body. Once the client-side PUT succeeds, it calls the realm's own
// existing PATCH endpoint (member `PATCH /member/me`'s bio update, or
// the branch's `PATCH /branch/trainers/:id`) with the returned
// `publicUrl` to actually persist `photoUrl` — this module never
// touches the database.
@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Auth('member')
  @Post('member/photo')
  presignMemberPhoto(@Body() dto: PresignPhotoDto, @CurrentUser() user: AuthenticatedUser) {
    return this.uploads.presignUpload('member-photo', user.sub, dto.contentType);
  }

  @Auth('staff', ['trainer', 'branch_manager'])
  @Post('trainer/photo')
  presignTrainerPhoto(@Body() dto: PresignPhotoDto, @CurrentUser() user: AuthenticatedUser) {
    return this.uploads.presignUpload('trainer-photo', user.sub, dto.contentType);
  }
}
