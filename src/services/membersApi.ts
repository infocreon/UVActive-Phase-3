import { api } from './api';

export type Sex = 'male' | 'female' | 'other';

// Shape returned by GET member/me (MembersService.getFullDetail) — the
// full row, unlike the trimmed profile login returns. This is what the
// formula-engine needs (age/sex/height/weight/restingHr) plus what
// Home/Settings display.
export interface MemberFullProfile {
  id: string;
  memberCode: string;
  name: string;
  phone: string | null;
  email: string | null;
  photoUrl: string | null;
  status: string;
  currentGymId: string | null;
  currentGym?: { id: string; name: string } | null;
  ageYears: number | null;
  sex: Sex | null;
  heightCm: number | null;
  weightKg: number | null;
  restingHr: number | null;
  createdAt: string;
}

export const membersApi = {
  me: () => api.get<MemberFullProfile>('/member/me'),

  // Settings "edit details" — bio fields only. Name/phone/email are
  // deliberately not accepted here; those only change via Branch
  // Portal / Admin Panel (see MemberSelfUpdateDto on the backend).
  updateBio: (dto: { sex?: Sex; ageYears?: number; heightCm?: number; weightKg?: number; restingHr?: number }) =>
    api.patch<MemberFullProfile>('/member/me', dto),
};
