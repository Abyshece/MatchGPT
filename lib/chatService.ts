// ============================================================================
// chatService
//
// Wraps the `messages` table + Supabase Realtime subscriptions.
//
// Realtime: we subscribe to `messages` rows filtered by match_id. Whenever
// a new row inserts, our callback fires within ~100ms. No polling.
//
// We also expose a "global" subscription used by Dashboard to fire match
// celebrations: listens for new `matches` rows where current user is a party.
// ============================================================================

import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type MessageType = 'text' | 'date_proposal' | 'contact';  // contact: a number shared with Share my number

export interface Message {
  id: string;
  matchId: string;
  senderId: string;
  content: string;
  messageType: MessageType;
  readAt: string | null;
  createdAt: string;
}

// ----------------------------------------------------------------------------
// listMessages — load all messages in a match, oldest first
// ----------------------------------------------------------------------------

export async function listMessages(matchId: string): Promise<{ messages: Message[]; error: string | null }> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('match_id', matchId)
    .order('created_at', { ascending: true });

  if (error) return { messages: [], error: error.message };

  const messages: Message[] = (data ?? []).map((row) => ({
    id: row.id,
    matchId: row.match_id,
    senderId: row.sender_id,
    content: row.content,
    messageType: row.message_type as MessageType,
    readAt: row.read_at,
    createdAt: row.created_at,
  }));

  return { messages, error: null };
}

// ----------------------------------------------------------------------------
// sendMessage — insert a new message
// ----------------------------------------------------------------------------

export async function sendMessage(
  matchId: string,
  senderId: string,
  content: string,
  messageType: MessageType = 'text'
): Promise<{ message: Message | null; error: string | null }> {
  if (!content || !content.trim()) {
    return { message: null, error: 'Message cannot be empty' };
  }
  if (content.length > 5000) {
    return { message: null, error: 'Message too long (max 5000 chars)' };
  }

  const { data, error } = await supabase
    .from('messages')
    .insert({
      match_id: matchId,
      sender_id: senderId,
      content: content.trim(),
      message_type: messageType,
    })
    .select()
    .single();

  if (error) return { message: null, error: error.message };

  return {
    message: {
      id: data.id,
      matchId: data.match_id,
      senderId: data.sender_id,
      content: data.content,
      messageType: data.message_type as MessageType,
      readAt: data.read_at,
      createdAt: data.created_at,
    },
    error: null,
  };
}

// ----------------------------------------------------------------------------
// shareMyNumber — the member's own number into the chat, as a message only
// share_my_number() can send (it checks the match and the number, and keeps
// the number on the profile, never shown, if asked to remember it)
// ----------------------------------------------------------------------------

export async function shareMyNumber(
  matchId: string,
  phone: string,
  remember: boolean,
): Promise<{ message: Message | null; error: string | null }> {
  const { data, error } = await supabase.rpc('share_my_number', { p_match_id: matchId, p_phone: phone, p_remember: remember });
  if (error || !data) return { message: null, error: error?.message ?? 'Your number was not shared.' };
  const row = data as unknown as Record<string, string | null>;
  return {
    message: {
      id: row.id as string,
      matchId: row.match_id as string,
      senderId: row.sender_id as string,
      content: row.content as string,
      messageType: 'contact',
      readAt: row.read_at,
      createdAt: row.created_at as string,
    },
    error: null,
  };
}

/** +919876543210 → "+91 98765 43210"; other countries as they are */
export function formatPhone(phone: string): string {
  const m = phone.match(/^\+91(\d{5})(\d{5})$/);
  return m ? `+91 ${m[1]} ${m[2]}` : phone;
}

// ----------------------------------------------------------------------------
// markRead — mark all unread messages in a match as read by current user
// ----------------------------------------------------------------------------

export async function markRead(matchId: string): Promise<{ count: number; error: string | null }> {
  const { data, error } = await supabase.rpc('mark_messages_read', { p_match_id: matchId });
  if (error) return { count: 0, error: error.message };
  return { count: Number(data ?? 0), error: null };
}

// ============================================================================
// REALTIME
// ============================================================================

// ----------------------------------------------------------------------------
// subscribeToMatch — listen for new messages in one match
//
// Returns a cleanup function. Call cleanup() in component unmount.
// ----------------------------------------------------------------------------

export function subscribeToMatch(
  matchId: string,
  onNewMessage: (msg: Message) => void,
  onUpdate?: (msg: Message) => void  // for read_at flips
): () => void {
  // Unique suffix prevents reusing a still-joined channel after React
  // StrictMode double-mounts or tab re-renders.
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const channel: RealtimeChannel = supabase
    .channel(`match:${matchId}:${suffix}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` },
      (payload) => {
        const row = payload.new as Record<string, unknown>;
        onNewMessage({
          id: row.id as string,
          matchId: row.match_id as string,
          senderId: row.sender_id as string,
          content: row.content as string,
          messageType: row.message_type as MessageType,
          readAt: (row.read_at as string) ?? null,
          createdAt: row.created_at as string,
        });
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` },
      (payload) => {
        if (!onUpdate) return;
        const row = payload.new as Record<string, unknown>;
        onUpdate({
          id: row.id as string,
          matchId: row.match_id as string,
          senderId: row.sender_id as string,
          content: row.content as string,
          messageType: row.message_type as MessageType,
          readAt: (row.read_at as string) ?? null,
          createdAt: row.created_at as string,
        });
      }
    )
    .subscribe();

  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;
    supabase.removeChannel(channel).catch(() => {});
  };
}

// ----------------------------------------------------------------------------
// subscribeToNewMatches — fires when a new match row is inserted involving me
//
// Used by the Dashboard to show the celebration modal.
// ----------------------------------------------------------------------------

export interface NewMatchEvent {
  matchId: string;
  userAId: string;
  userBId: string;
  createdAt: string;
}

export function subscribeToNewMatches(
  userId: string,
  onMatch: (event: NewMatchEvent) => void
): () => void {
  // CRITICAL: unique suffix per call so React StrictMode double-mounts and
  // tab-switching don't reuse a previously-subscribed channel. If you reuse a
  // channel name with the same `supabase` instance, .on() throws after
  // .subscribe() because the channel is already "joined".
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const handler = (payload: { new: Record<string, unknown> }) => {
    const row = payload.new;
    onMatch({
      matchId: row.id as string,
      userAId: row.user_a_id as string,
      userBId: row.user_b_id as string,
      createdAt: row.created_at as string,
    });
  };

  const channelA = supabase
    .channel(`new_match_a:${userId}:${suffix}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'matches', filter: `user_a_id=eq.${userId}` },
      handler
    )
    .subscribe();

  const channelB = supabase
    .channel(`new_match_b:${userId}:${suffix}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'matches', filter: `user_b_id=eq.${userId}` },
      handler
    )
    .subscribe();

  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;
    supabase.removeChannel(channelA).catch(() => {});
    supabase.removeChannel(channelB).catch(() => {});
  };
}
