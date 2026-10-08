import React, { useState } from 'react';
import { ENQUIRY_TOPICS, submitEnquiry, type EnquiryTopic } from '../lib/adminGrowth';

// ============================================================================
// The contact form (the website's Support page): name, email, what it's
// about and the message. It lands in Admin → Enquiries, and the admins are
// alerted. A few a day from one address (submit_enquiry()).
// ============================================================================

const field = 'w-full rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-zinc-600';
const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1';

const ContactForm: React.FC<{ source?: 'website' | 'app' }> = ({ source = 'website' }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [topic, setTopic] = useState<EnquiryTopic>('general');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const ready = name.trim() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) && message.trim().length >= 10;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setSending(true);
    setError(null);
    const res = await submitEnquiry({ name, email, topic, message, source });
    setSending(false);
    if (res.error) setError(res.error);
    else setSent(true);
  };

  if (sent) {
    return (
      <div role="status" className="rounded-xl border border-gray-200 dark:border-zinc-800 p-5" data-testid="contact-sent">
        <p className="font-semibold text-gray-900 dark:text-white">Thank you, we've got your message.</p>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">We reply by email to {email.trim()}, usually within two working days.</p>
      </div>
    );
  }

  return (
    <form onSubmit={send} className="space-y-4" data-testid="contact-form" noValidate>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="contact-name" className={labelClass}>Your name</label>
          <input id="contact-name" autoComplete="name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} className={field} />
        </div>
        <div>
          <label htmlFor="contact-email" className={labelClass}>Email</label>
          <input id="contact-email" type="email" autoComplete="email" value={email} maxLength={200} onChange={(e) => setEmail(e.target.value)} className={field} />
        </div>
      </div>
      <div>
        <label htmlFor="contact-topic" className={labelClass}>About</label>
        <select id="contact-topic" value={topic} onChange={(e) => setTopic(e.target.value as EnquiryTopic)} className={field}>
          {ENQUIRY_TOPICS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="contact-message" className={labelClass}>Message</label>
        <textarea id="contact-message" rows={5} value={message} maxLength={4000} onChange={(e) => setMessage(e.target.value)} className={field} />
      </div>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button type="submit" disabled={!ready || sending} className="h-11 px-5 rounded-lg bg-black text-white dark:bg-white dark:text-black text-sm font-semibold disabled:opacity-40">
        {sending ? 'Sending…' : 'Send message'}
      </button>
    </form>
  );
};

export default ContactForm;
