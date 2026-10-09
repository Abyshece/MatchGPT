import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '../../lib/useToast';
import {
  fetchPendingVerifications, reviewVerificationRequest,
} from '../../lib/verificationService';
import type { PendingVerification } from '../../lib/verificationService';
import {
  assessVerification, fetchVerificationSignals, VERDICT_LABEL, type Assessment, type VerificationSignals,
} from '../../lib/verificationChecks';
import {
  IconUser, IconCheck, IconAlert, IconX, IconIdCard, IconLinkedin, IconInstagram, IconFacebook, IconTwitter,
} from '../../constants';

// ============================================================================
// AdminVerificationsTab
//
// Lists pending verification requests for admin review. Each request shows:
//   - Whether it's likely to pass, and why (lib/verificationChecks.ts)
//   - The user's name, email, primary photo
//   - All 4 social media links (clickable, opens in new tab)
//   - User's notes (if any)
//   - When the request was submitted
//   - Approve / Reject buttons with notes
// ============================================================================

interface AdminVerificationsTabProps {
  onAuditUpdate: () => void;
}

const AdminVerificationsTab: React.FC<AdminVerificationsTabProps> = ({ onAuditUpdate }) => {
  const { showToast } = useToast();
  const [requests, setRequests] = useState<PendingVerification[]>([]);
  const [signals, setSignals] = useState<Map<string, VerificationSignals>>(new Map());
  const [loading, setLoading] = useState(true);
  const [reviewModal, setReviewModal] = useState<{
    req: PendingVerification;
    decision: 'approved' | 'rejected';
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ requests, error }, checks] = await Promise.all([fetchPendingVerifications(), fetchVerificationSignals()]);
    setLoading(false);
    if (error) {
      showToast(`Couldn't load: ${error}`, 'error');
      return;
    }
    if (checks.error) showToast(`Couldn't load the checks: ${checks.error}`, 'error');
    setSignals(checks.signals);
    setRequests(requests);
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const handleReview = async (notes: string) => {
    if (!reviewModal) return;
    const { req, decision } = reviewModal;
    setReviewModal(null);

    const { error } = await reviewVerificationRequest(req.request_id, decision, notes);
    if (error) {
      showToast(`Couldn't ${decision === 'approved' ? 'approve' : 'reject'}: ${error}`, 'error');
      return;
    }

    showToast(`${req.user_name} ${decision === 'approved' ? 'verified' : 'rejected'}`, 'success');
    onAuditUpdate();
    load();
  };

  return (
    <div>
      {loading && requests.length === 0 ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="bg-white dark:bg-zinc-800 rounded-lg p-4 h-40 animate-pulse" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-zinc-800 rounded-lg border border-gray-100 dark:border-zinc-700">
          <div className="mb-2 flex justify-center text-gray-300 dark:text-zinc-600 [&>svg]:w-10 [&>svg]:h-10" aria-hidden="true"><IconIdCard /></div>
          <p className="text-sm font-bold text-gray-900 dark:text-white">No pending verifications</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">All caught up.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <VerdictSummary assessments={requests.map((req) => assessVerification(req, signals.get(req.request_id)))} />
          {requests.map((req) => (
            <VerificationCard
              key={req.request_id}
              req={req}
              assessment={assessVerification(req, signals.get(req.request_id))}
              onApprove={() => setReviewModal({ req, decision: 'approved' })}
              onReject={() => setReviewModal({ req, decision: 'rejected' })}
            />
          ))}
        </div>
      )}

      {reviewModal && (
        <ReviewModal
          req={reviewModal.req}
          decision={reviewModal.decision}
          onCancel={() => setReviewModal(null)}
          onConfirm={handleReview}
        />
      )}
    </div>
  );
};

// ============================================================================
// VerificationCard
// ============================================================================

const VERDICT_STYLE: Record<Assessment['verdict'], string> = {
  likely: 'bg-green-50 border-green-200 text-green-900 dark:bg-green-900/20 dark:border-green-900/50 dark:text-green-200',
  check: 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-900/20 dark:border-amber-900/50 dark:text-amber-200',
  unlikely: 'bg-red-50 border-red-200 text-red-900 dark:bg-red-900/20 dark:border-red-900/50 dark:text-red-200',
};
const MARK = { pass: <IconCheck />, warn: <IconAlert />, fail: <IconX /> };

const VerdictSummary: React.FC<{ assessments: Assessment[] }> = ({ assessments }) => {
  const count = (v: Assessment['verdict']) => assessments.filter((a) => a.verdict === v).length;
  return (
    <p className="text-sm text-gray-600 dark:text-zinc-300" data-testid="verification-summary">
      {assessments.length} waiting · {count('likely')} likely to pass · {count('check')} to check closely · {count('unlikely')} unlikely
    </p>
  );
};

const VerificationCard: React.FC<{
  req: PendingVerification;
  assessment: Assessment;
  onApprove: () => void;
  onReject: () => void;
}> = ({ req, assessment, onApprove, onReject }) => {
  const links: { label: string; icon: React.ReactNode; url: string | null }[] = [
    { label: 'LinkedIn', icon: <IconLinkedin />, url: req.linkedin_url },
    { label: 'Instagram', icon: <IconInstagram />, url: req.instagram_url },
    { label: 'Facebook', icon: <IconFacebook />, url: req.facebook_url },
    { label: 'Twitter', icon: <IconTwitter />, url: req.twitter_url },
  ];
  const linkCount = links.filter((l) => l.url).length;
  const photo = req.user_photo_urls?.[0];

  return (
    <div className="bg-white dark:bg-zinc-800 rounded-lg p-4 border border-gray-200 dark:border-zinc-700">
      {/* Header: photo + name + meta */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-zinc-700 overflow-hidden flex-shrink-0">
          {photo ? (
            <img src={photo} alt={req.user_name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 [&_svg]:w-7 [&_svg]:h-7"><IconUser /></div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-gray-900 dark:text-white text-sm">{req.user_name}</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400">{req.user_email}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            Requested {new Date(req.requested_at).toLocaleString()} · {linkCount} link{linkCount === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {/* Will it pass? */}
      <div className={`rounded-md border p-3 mb-3 ${VERDICT_STYLE[assessment.verdict]}`} data-testid="verification-check">
        <p className="text-sm font-semibold">{VERDICT_LABEL[assessment.verdict]}</p>
        <ul className="mt-1.5 space-y-0.5 text-xs">
          {assessment.checks.map((c) => (
            <li key={c.text} className="flex gap-2">
              <span aria-hidden="true" className="flex-none mt-px [&>svg]:w-3.5 [&>svg]:h-3.5">{MARK[c.level]}</span>
              <span>{c.text}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Social links */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {links.map((l) =>
          l.url ? (
            <a
              key={l.label}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-zinc-900/50 border border-gray-200 dark:border-zinc-700 rounded text-xs hover:border-blue-400 dark:hover:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
            >
              <span aria-hidden="true" className="flex-none [&>svg]:w-3.5 [&>svg]:h-3.5">{l.icon}</span>
              <span className="font-medium text-gray-700 dark:text-gray-300 truncate flex-1">{l.label}</span>
              <span className="text-blue-500">↗</span>
            </a>
          ) : (
            <div
              key={l.label}
              className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-zinc-900/50 border border-dashed border-gray-200 dark:border-zinc-700 rounded text-xs opacity-50"
            >
              <span aria-hidden="true" className="flex-none [&>svg]:w-3.5 [&>svg]:h-3.5">{l.icon}</span>
              <span className="font-medium text-gray-500 dark:text-gray-400 truncate">{l.label}</span>
              <span className="text-[10px] text-gray-500 dark:text-gray-400">—</span>
            </div>
          )
        )}
      </div>

      {/* User notes */}
      {req.user_notes && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 rounded p-2.5 mb-3 text-xs text-blue-900 dark:text-blue-200">
          <p className="font-bold mb-0.5">User notes:</p>
          <p className="italic">"{req.user_notes}"</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onReject}
          className="flex-1 py-2 text-xs font-bold border border-gray-300 dark:border-zinc-700 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-700"
        >
          Reject
        </button>
        <button
          onClick={onApprove}
          className="flex-1 py-2 inline-flex items-center justify-center gap-1 text-xs font-bold bg-blue-600 text-white rounded hover:bg-blue-700 shadow-sm"
        >
          <span aria-hidden="true" className="[&>svg]:w-3.5 [&>svg]:h-3.5"><IconCheck /></span>Approve
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// ReviewModal
// ============================================================================

const ReviewModal: React.FC<{
  req: PendingVerification;
  decision: 'approved' | 'rejected';
  onCancel: () => void;
  onConfirm: (notes: string) => void;
}> = ({ req, decision, onCancel, onConfirm }) => {
  const [notes, setNotes] = useState('');

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4 popup-backdrop animate-fade-in"
      onClick={onCancel}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200 dark:border-zinc-800 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
          {decision === 'approved' ? `Approve ${req.user_name}?` : `Reject ${req.user_name}'s request?`}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {decision === 'approved'
            ? 'Their profile will show a verified badge to other users.'
            : 'They can submit again. Tell them what was missing or wrong (this message is shown to them).'}
        </p>

        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">
          Notes {decision === 'rejected' ? '(shown to user)' : '(optional, audit only)'}
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder={decision === 'rejected' ? 'e.g. Could not find a matching public profile on these accounts' : 'Optional notes for the audit log'}
          className="w-full bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg p-2.5 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
        />

        <div className="flex gap-2 mt-4">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 border border-gray-300 dark:border-zinc-700 rounded-lg text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(notes)}
            disabled={decision === 'rejected' && !notes.trim()}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold text-white shadow-sm disabled:opacity-50 ${
              decision === 'approved' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700'
            }`}
          >
            {decision === 'approved' ? 'Approve' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminVerificationsTab;
