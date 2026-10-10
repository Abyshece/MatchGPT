// ============================================================================
// My requests (Settings): what a member asked of the team, and where each
// stands: verification requests, complaints to the Grievance Officer,
// reports about other members and problems they reported (my_requests() in
// supabase/migrations/…_payments_and_reliability.sql). A report says only
// whether the team acted, never what happened to the other member.
// ============================================================================

import { supabase } from './supabase';
import { GRIEVANCE_CATEGORIES } from './grievances';
import { REPORT_DEADLINE_HOURS, REPORT_REASONS } from './blocksService';
import { reasonText } from './verificationSelfie';

interface VerificationItem {
  id: string; status: 'pending' | 'approved' | 'rejected'; created_at: string; reviewed_at: string | null;
  reason_code: string | null; note: string | null; selfie: boolean;
}
interface ComplaintItem {
  id: string; ticket: string; category: string; status: 'open' | 'in_progress' | 'resolved' | 'rejected';
  created_at: string; due_at: string; resolved_at: string | null; resolution: string | null;
}
interface ProblemItem {
  id: string; details: string; status: 'open' | 'answered' | 'closed'; answer: string | null;
  created_at: string; answered_at: string | null;
}
interface ReportItem {
  id: string; name: string | null; reason: string; outcome: 'open' | 'acted' | 'no_breach';
  created_at: string; resolved_at: string | null;
}

export type RequestState = 'waiting' | 'done' | 'declined';

/** One row in the list, whatever kind of request it is */
export interface RequestRow {
  id: string;
  kind: 'verification' | 'complaint' | 'report' | 'problem';
  title: string;
  createdAt: string;
  state: RequestState;
  status: string;        // "Waiting", "Approved", "Answered"…
  detail: string;        // what we said, or what happens next
  note?: string | null;  // the team's own words, when there are some
  retry?: boolean;       // a verification that can be tried again
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

export function toRows(data: {
  verifications: VerificationItem[]; complaints: ComplaintItem[]; reports: ReportItem[]; problems?: ProblemItem[];
}, now = Date.now()): RequestRow[] {
  const rows: RequestRow[] = [];
  data.verifications.forEach((v, i) => {
    rows.push({
      id: v.id, kind: 'verification', title: 'Verified badge', createdAt: v.created_at,
      state: v.status === 'pending' ? 'waiting' : v.status === 'approved' ? 'done' : 'declined',
      status: v.status === 'pending' ? 'In review' : v.status === 'approved' ? 'Approved' : 'Not approved',
      detail: v.status === 'pending'
        ? (now - new Date(v.created_at).getTime() > 48 * 3_600_000
          ? "Taking longer than usual, sorry. It's still in the queue."
          : 'We usually decide within 24–48 hours.')
        : v.status === 'approved' ? 'Your profile shows the Verified badge.' : reasonText(v.reason_code),
      note: v.status === 'rejected' ? v.note : null,
      // Only the latest one, and only while it's the latest word
      retry: i === 0 && v.status === 'rejected',
    });
  });
  for (const g of data.complaints) {
    const category = GRIEVANCE_CATEGORIES.find((c) => c.value === g.category)?.label ?? 'Something else';
    const answered = g.status === 'resolved' || g.status === 'rejected';
    rows.push({
      id: g.id, kind: 'complaint', title: `Complaint ${g.ticket}`, createdAt: g.created_at,
      state: answered ? 'done' : 'waiting',
      status: answered ? (g.status === 'resolved' ? 'Answered' : 'Closed') : g.status === 'in_progress' ? 'Being looked into' : 'Received',
      detail: answered
        ? category
        : `${category}. We answer by ${when(g.due_at)} at the latest.`,
      note: g.resolution,
    });
  }
  for (const r of data.reports) {
    const reason = REPORT_REASONS.find((x) => x.value === r.reason)?.label ?? 'Other';
    // What the Help Center promises: 2 hours where the law says so, otherwise 24
    const hours = Math.min(24, REPORT_DEADLINE_HOURS[r.reason] ?? REPORT_DEADLINE_HOURS.other);
    rows.push({
      id: r.id, kind: 'report', title: `Report about ${r.name ?? 'a member'}`, createdAt: r.created_at,
      state: r.outcome === 'open' ? 'waiting' : 'done',
      status: r.outcome === 'open' ? 'Being looked into' : r.outcome === 'acted' ? 'We acted on it' : 'No breach found',
      detail: r.outcome === 'open'
        ? `${reason}. We look into it within ${hours} hours.`
        : r.outcome === 'acted'
          ? `${reason}. Thank you for telling us.`
          : `${reason}. We didn't find a breach of our rules this time. You can block anyone you don't want to hear from.`,
    });
  }
  for (const x of data.problems ?? []) {
    rows.push({
      id: x.id, kind: 'problem', title: 'Problem you reported', createdAt: x.created_at,
      state: x.status === 'open' ? 'waiting' : 'done',
      status: x.status === 'open' ? 'Being looked into' : x.status === 'answered' ? 'Answered' : 'Closed',
      detail: x.details.length > 140 ? `${x.details.slice(0, 140)}…` : x.details,
      note: x.answer,
    });
  }
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function fetchMyRequests(): Promise<{ rows: RequestRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc('my_requests');
  if (error) return { rows: [], error: error.message };
  const d = (data ?? {}) as {
    verifications?: VerificationItem[]; complaints?: ComplaintItem[]; reports?: ReportItem[]; problems?: ProblemItem[];
  };
  return {
    rows: toRows({ verifications: d.verifications ?? [], complaints: d.complaints ?? [], reports: d.reports ?? [], problems: d.problems ?? [] }),
    error: null,
  };
}
