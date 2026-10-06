// deno test supabase/functions/_shared/fcm_test.ts
import { assertEquals } from 'jsr:@std/assert@1';
import { fcmMessage, fcmOutcome } from './fcm.ts';

Deno.test('a message notification: Android channel and grouping per chat, data as strings', () => {
  const m = fcmMessage({
    token: 'phone-token',
    eventType: 'new_message',
    title: '💬 Priya sent you a message',
    body: 'Open Shaadi24 to read it',
    data: { match_id: 'm-1', sender_id: 's-1', deep_link: '/matches', count: 2, nothing: null },
  }) as any;
  assertEquals(m.token, 'phone-token');
  assertEquals(m.notification, { title: '💬 Priya sent you a message', body: 'Open Shaadi24 to read it' });
  assertEquals(m.data, { event_type: 'new_message', match_id: 'm-1', sender_id: 's-1', deep_link: '/matches', count: '2' });
  assertEquals(m.android.priority, 'high');
  assertEquals(m.android.notification.channel_id, 'messages');
  assertEquals(m.android.notification.tag, 'new_message-m-1');
  assertEquals(m.android.notification.icon, 'ic_stat_notify');
  assertEquals(m.apns.headers['apns-collapse-id'], 'new_message-m-1');
  assertEquals(m.apns.payload.aps['thread-id'], 'new_message-m-1');
  assertEquals(m.apns.payload.aps.sound, 'default');
});

Deno.test('matches and super likes use their own channels; super likes share one notification', () => {
  const match = fcmMessage({ token: 't', eventType: 'new_match', title: 'x', body: 'y', data: { match_id: 'm-2' } }) as any;
  assertEquals(match.android.notification.channel_id, 'matches');
  const like = fcmMessage({ token: 't', eventType: 'super_like', title: 'x', body: 'y', data: { liker_id: 'l-1' } }) as any;
  assertEquals(like.android.notification.channel_id, 'likes');
  assertEquals(like.android.notification.tag, 'super_like');
  const other = fcmMessage({ token: 't', eventType: 'something_new', title: 'x', body: 'y', data: null }) as any;
  assertEquals(other.android.notification.channel_id, 'messages');
  assertEquals(other.data, { event_type: 'something_new' });
});

Deno.test("FCM's answers: which phones to forget, retry or leave alone", () => {
  const err = (code: number, status: string, message: string, errorCode?: string) => ({
    error: { code, status, message, details: errorCode ? [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode }] : [] },
  });
  assertEquals(fcmOutcome(200, { name: 'projects/p/messages/1' } as any), 'sent');
  assertEquals(fcmOutcome(404, err(404, 'NOT_FOUND', 'Requested entity was not found.', 'UNREGISTERED')), 'gone');
  assertEquals(fcmOutcome(400, err(400, 'INVALID_ARGUMENT', 'The registration token is not a valid FCM registration token', 'INVALID_ARGUMENT')), 'gone');
  assertEquals(fcmOutcome(403, err(403, 'PERMISSION_DENIED', 'SenderId mismatch', 'SENDER_ID_MISMATCH')), 'gone');
  assertEquals(fcmOutcome(429, err(429, 'RESOURCE_EXHAUSTED', 'Quota exceeded', 'QUOTA_EXCEEDED')), 'retry');
  assertEquals(fcmOutcome(503, err(503, 'UNAVAILABLE', 'The service is currently unavailable.', 'UNAVAILABLE')), 'retry');
  assertEquals(fcmOutcome(500, null), 'retry');
  // Our side: a bad message, the API switched off, a wrong key: the phone is fine
  assertEquals(fcmOutcome(400, err(400, 'INVALID_ARGUMENT', 'Invalid value at message.android.ttl', 'INVALID_ARGUMENT')), 'setup');
  assertEquals(fcmOutcome(403, err(403, 'PERMISSION_DENIED', 'Firebase Cloud Messaging API has not been used in project')), 'setup');
  assertEquals(fcmOutcome(401, err(401, 'UNAUTHENTICATED', 'Request had invalid authentication credentials.', 'THIRD_PARTY_AUTH_ERROR')), 'setup');
});
