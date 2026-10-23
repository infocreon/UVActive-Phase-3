import { IsIn } from 'class-validator';

// `kind` is intentionally NOT derived from the URL path alone — it's a
// real field so PresignPhotoDto can be reused verbatim from every
// realm's controller (member/me, trainer/me, branch/members) without
// three near-duplicate DTOs. `contentType` is checked against the
// server's allowlist in UploadsService, not trusted as-is.
export class PresignPhotoDto {
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  contentType!: string;
}
