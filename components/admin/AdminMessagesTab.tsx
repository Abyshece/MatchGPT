import React, { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../lib/useToast';
import { BLANK_MESSAGE, fetchSentMessages, TARGETS, type MessageDraft, type SentMessage } from '../../lib/adminGrowth';
import MessageComposer from './MessageComposer';

// ============================================================================
// Admin → Messages: in-app messages (and notifications) to a group of
// members, and what was sent: to whom, how many, how many saw it and how
// many tapped its button.
// ============================================================================

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '—');

const AdminMessagesTab: React.FC = () => {
  const { showToast } = useToast();
  const [messages, setMessages] = useState<SentMessage[] | null>(null);
  const [draft, setDraft] = useState<MessageDraft | null>(null);

  const load = useCallback(async () => {
    const { messages, error } = await fetchSentMessages();
    if (error) showToast(`Couldn't load messages: ${error}`, 'error');
    setMessages(messages);
  }, [showToast]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div data-testid="admin-messages">
      <div className="flex justify-end mb-4">
        <button type="button" onClick={() => setDraft(BLANK_MESSAGE)} className="h-9 px-4 rounded-md plus-solid text-sm font-semibold">New message</button>
      </div>

      {messages === null ? (
        <div className="h-40 rounded-lg bg-gray-50 dark:bg-zinc-800 animate-pulse" />
      ) : messages.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-zinc-400">No messages sent yet. Profiles has a ready message for each section members haven't completed.</p>
      ) : (
        <div className="border border-gray-200 dark:border-zinc-800 rounded-lg overflow-x-auto">
          <table className="w-full text-sm" data-testid="sent-messages">
            <thead className="bg-gray-50 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400">
              <tr>
                <th scope="col" className="text-left font-medium px-3 py-2">Message</th>
                <th scope="col" className="text-left font-medium px-3 py-2">To</th>
                <th scope="col" className="text-right font-medium px-3 py-2">Sent</th>
                <th scope="col" className="text-right font-medium px-3 py-2">Seen</th>
                <th scope="col" className="text-right font-medium px-3 py-2">Tapped</th>
                <th scope="col" className="text-left font-medium px-3 py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((m) => (
                <tr key={m.id} className="border-t border-gray-100 dark:border-zinc-800 align-top">
                  <td className="px-3 py-2.5 max-w-md">
                    <p className="font-medium text-gray-900 dark:text-white">{m.title}</p>
                    <p className="text-xs text-gray-500 dark:text-zinc-400 line-clamp-2">{m.body}</p>
                    {m.cta_label && (
                      <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
                        Button: {m.cta_label} → {TARGETS.find((t) => t.id === (m.cta_target ?? ''))?.label ?? m.cta_target}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{m.audience_label}{m.pushed ? ' · notified' : ''}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{m.recipients}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{m.seen} <span className="text-gray-400">({pct(m.seen, m.recipients)})</span></td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{m.clicked} <span className="text-gray-400">({pct(m.clicked, m.recipients)})</span></td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-gray-500 dark:text-zinc-400">{new Date(m.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {draft && <MessageComposer initial={draft} onClose={() => setDraft(null)} onSent={() => { setDraft(null); void load(); }} />}
    </div>
  );
};

export default AdminMessagesTab;
