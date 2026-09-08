import { api } from './api';

// Mirrors the cloud API's `notification` row shape for recipientType
// 'member' (see MemberNotificationsController). Powers the bell icon +
// badge on Home and the Notifications screen it opens — most notably
// `session_scheduled`, fired the moment a trainer puts a new session on
// the calendar, which is what lets a member tap straight through to
// book it.
export interface MemberNotification {
  id: string;
  type: string; // 'session_scheduled' | 'session_cancelled' | 'result_ready' | ...
  title: string | null;
  body: string;
  data: { sessionId?: string } | null;
  readAt: string | null;
  createdAt: string;
}

export const notificationsApi = {
  list: (unreadOnly = false) => api.get<MemberNotification[]>('/member/notifications', { unread: unreadOnly }),
  markRead: (id: string) => api.post(`/member/notifications/${id}/read`),
};
