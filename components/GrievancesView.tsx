import React, { useState } from 'react';
import { IconShield } from '../constants';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { LEGAL, orPending } from '../lib/legalInfo';
import { GRIEVANCE_CATEGORIES } from '../lib/grievances';
import { HindiSummary, LegalLayout, List, Mail, Section, Summary, linkClass } from './legal/LegalLayout';

// ============================================================================
// Grievance Redressal: the Grievance Officer and how to complain, as the IT
// Rules 2021 (rule 3(2), as amended 10 Feb 2026) ask every intermediary to
// publish "prominently", the consumer grievance officer of the Consumer
// Protection (E-Commerce) Rules 2020 (rule 4), and the way to use your rights
// under the DPDP Act. The form works for anyone, member or not, signed in or
// not: the complaint is acknowledged with a ticket at once, and the deadline
// the law sets goes with it (submit_grievance() in the database).
// ============================================================================


const inputClass = 'w-full px-3 py-2.5 text-sm border border-gray-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-gray-900 dark:text-white outline-none focus:border-black dark:focus:border-white focus:ring-1 focus:ring-black dark:focus:ring-white';
const labelClass = 'block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1.5';

const ComplaintForm: React.FC = () => {
  const { session, profile } = useAuth();
  const [category, setCategory] = useState('');
  const [name, setName] = useState(profile?.name ?? '');
  const [email, setEmail] = useState(session?.user.email ?? '');
  const [phone, setPhone] = useState('');
  const [about, setAbout] = useState('');
  const [details, setDetails] = useState('');
  const [onBehalf, setOnBehalf] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ ticket: string; due: string } | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!category) return setError('Please choose what your complaint is about.');
    if (!name.trim()) return setError('Please give your name.');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Please give an email address we can reply to.');
    if (details.trim().length < 10) return setError('Please tell us what happened (at least 10 characters).');
    setSending(true);
    const { data, error: rpcError } = await supabase.rpc('submit_grievance', {
      p_category: category, p_name: name.trim(), p_email: email.trim(), p_details: details.trim(),
      p_about: about.trim() || undefined, p_phone: phone.trim() || undefined, p_on_behalf: onBehalf,
    });
    setSending(false);
    if (rpcError || !data) return setError(rpcError?.message ?? 'Your complaint could not be sent. Please email us instead.');
    const d = data as { ticket: string; due_at: string };
    setDone({
      ticket: d.ticket,
      due: new Date(d.due_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }),
    });
  };

  if (done) {
    return (
      <div role="status" data-testid="grievance-done" className="rounded-xl border border-green-200 dark:border-green-900/40 bg-green-50 dark:bg-green-950/30 p-5 text-sm text-gray-800 dark:text-gray-200">
        <p className="font-bold text-gray-900 dark:text-white mb-1">Complaint received: {done.ticket}</p>
        <p>We have your complaint and will answer by email at {email.trim()}, at the latest by {done.due} (India time).
          Please quote {done.ticket} if you write to us about it.</p>
      </div>
    );
  }

  const chosen = GRIEVANCE_CATEGORIES.find((c) => c.value === category);
  return (
    <form onSubmit={send} data-testid="grievance-form" className="space-y-4 rounded-xl border border-gray-200 dark:border-zinc-800 p-5">
      {error && (
        <div role="alert" className="px-3 py-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 text-xs font-medium text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
      <div>
        <label htmlFor="g-category" className={labelClass}>What is your complaint about?</label>
        <select id="g-category" value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
          <option value="" disabled>Choose</option>
          {GRIEVANCE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        {chosen && <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{chosen.hint}.</p>}
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="g-name" className={labelClass}>Your name</label>
          <input id="g-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={inputClass} autoComplete="name" />
        </div>
        <div>
          <label htmlFor="g-email" className={labelClass}>Your email address</label>
          <input id="g-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} className={inputClass} autoComplete="email" />
        </div>
      </div>
      <div>
        <label htmlFor="g-phone" className={labelClass}>Phone number (optional)</label>
        <input id="g-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} className={inputClass} autoComplete="tel" />
      </div>
      <div>
        <label htmlFor="g-about" className={labelClass}>Which profile, message or payment is it about? (optional)</label>
        <input id="g-about" value={about} onChange={(e) => setAbout(e.target.value)} maxLength={300}
          placeholder="For example the profile's name and city, or the store's order number" className={inputClass} />
      </div>
      <div>
        <label htmlFor="g-details" className={labelClass}>What happened?</label>
        <textarea id="g-details" value={details} onChange={(e) => setDetails(e.target.value)} rows={5} maxLength={4000}
          className={`${inputClass} resize-y`} />
      </div>
      <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
        <input type="checkbox" checked={onBehalf} onChange={(e) => setOnBehalf(e.target.checked)} className="mt-0.5 w-4 h-4 flex-none" />
        <span>I'm complaining for someone else, with their knowledge (for example, for a family member).</span>
      </label>
      <div className="flex items-center justify-between gap-4 pt-2">
        <p className="text-xs text-gray-600 dark:text-gray-400">We use these details only to deal with your complaint.</p>
        <button type="submit" disabled={sending}
          className="flex-none h-11 px-6 rounded-lg bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-gray-200 text-white dark:text-black text-sm font-bold disabled:opacity-50">
          {sending ? 'Sending…' : 'Send complaint'}
        </button>
      </div>
    </form>
  );
};

const GrievancesView: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <LegalLayout title="Grievance Redressal" icon={<IconShield />} onBack={onBack}>
    <Summary title="Make a complaint">
      <p>Tell us about anything wrong on {LEGAL.brand}, such as a fake profile, abuse, a dowry demand, a problem with
        your data or a payment, using the form below or by email. You get a ticket number at once, and we answer within
        the times Indian law sets. If you are in danger, call the police on <strong>112</strong>.</p>
    </Summary>

    <Section title="Our Grievance Officer">
      <List>
        <li>Name: {LEGAL.grievanceOfficer.name}, {LEGAL.grievanceOfficer.designation}</li>
        <li>Email: <Mail to={LEGAL.grievanceEmail} />{LEGAL.grievanceOfficer.phone ? <> · Phone: {LEGAL.grievanceOfficer.phone}</> : null}</li>
        <li>Address: {LEGAL.operator}, {orPending(LEGAL.address)}</li>
        <li>Hours: {LEGAL.supportHours}. Complaints made through the form are received at any time.</li>
      </List>
      <p>The Grievance Officer also handles consumer complaints about payments, questions and requests about your
        personal data, and orders and notices from courts and government agencies.</p>
    </Section>

    <Section id="complain" title="Make a complaint">
      <p>Members can also report a profile or message in the app (⋯ → Report). Anyone, member or not, can use this
        form:</p>
      <ComplaintForm />
    </Section>

    <Section title="What happens next">
      <List>
        <li>We <strong>acknowledge</strong> every complaint within 24 hours (the form does at once, with your ticket
          number).</li>
        <li>Intimate, nude or sexual images of you, or someone impersonating you (including morphed photos): we act to
          remove or disable access to it <strong>within 2 hours</strong> (IT Rules 2021, rule 3(2)(b)).</li>
        <li>Requests to remove obscene, abusive, hateful, misleading or other unlawful content: resolved{' '}
          <strong>within 36 hours</strong> (rule 3(2)(a)).</li>
        <li>Other complaints, including about your personal data: resolved <strong>within 7 days</strong> (and requests
          about personal data always within the 90 days the DPDP Rules allow).</li>
        <li>Payments and subscriptions: acknowledged within 48 hours and resolved <strong>within a month</strong>{' '}
          (Consumer Protection (E-Commerce) Rules, 2020).</li>
      </List>
      <p>We reply by email, with what we did and why. To keep complaints from being misused, we may ask you to show
        that a complaint about intimate images or impersonation concerns you, or that you act for that person.</p>
    </Section>

    <Section title="If you're not satisfied">
      <List>
        <li><strong>Grievance Appellate Committee</strong>: if you disagree with the Grievance Officer's decision, or
          your complaint isn't resolved in time, you can appeal within 30 days at{' '}
          <a className={linkClass} href="https://gac.gov.in" target="_blank" rel="noreferrer">gac.gov.in</a>.</li>
        <li><strong>Data Protection Board of India</strong>: for complaints about your personal data, once you have used
          our grievance process (DPDP Act, 2023, section 13).</li>
        <li><strong>Consumer complaints</strong>: the National Consumer Helpline, 1915 or{' '}
          <a className={linkClass} href="https://consumerhelpline.gov.in" target="_blank" rel="noreferrer">consumerhelpline.gov.in</a>,
          and the consumer commissions at{' '}
          <a className={linkClass} href="https://edaakhil.nic.in" target="_blank" rel="noreferrer">edaakhil.nic.in</a>.</li>
      </List>
    </Section>

    <Section title="Help in an emergency">
      <List>
        <li>Police and emergencies: <strong>112</strong></li>
        <li>Women's helpline: <strong>181</strong></li>
        <li>Cyber fraud and online crime: <strong>1930</strong>, or report at{' '}
          <a className={linkClass} href="https://cybercrime.gov.in" target="_blank" rel="noreferrer">cybercrime.gov.in</a></li>
      </List>
      <p>See also our <a className={linkClass} href="/safety">Community Guidelines and Safety</a> page.</p>
    </Section>

    <HindiSummary>
      <p>शादी24 पर किसी भी समस्या, जैसे नकली प्रोफ़ाइल, दुर्व्यवहार, दहेज की माँग, आपके डेटा या भुगतान से जुड़ी शिकायत, के लिए ऊपर
        दिए फ़ॉर्म या ईमेल से हमारे शिकायत निवारण अधिकारी से संपर्क करें। आपको तुरंत टिकट नंबर मिलेगा।</p>
      <p>आपकी अंतरंग या अश्लील तस्वीरें, या आपका रूप धरकर बनाई गई प्रोफ़ाइल शिकायत के 2 घंटे के भीतर हटाई जाएगी; अन्य गैरकानूनी
        सामग्री 36 घंटे में, और बाकी शिकायतें 7 दिनों में निपटाई जाएँगी। असंतुष्ट होने पर 30 दिनों में gac.gov.in पर अपील करें।
        आपात स्थिति में 112, महिला हेल्पलाइन 181 और साइबर धोखाधड़ी के लिए 1930 पर कॉल करें।</p>
    </HindiSummary>
  </LegalLayout>
);

export default GrievancesView;
