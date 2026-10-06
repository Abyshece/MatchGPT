import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '../../lib/useToast';
import {
  fetchPendingVerifications, reviewVerificationRequest,
} from '../../lib/verificationService';
import type { PendingVerification } from '../../lib/verificationService';

// ============================================================================
// AdminVerificationsTab
//
// Lists pending verification requests for admin review. Each request shows:
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
  const [loading, setLoading] = useState(true);
  const [reviewModal, setReviewModal] = useState<{
    req: PendingVerification;
    decision: 'approved' | 'rejected';
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { requests, error } = await fetchPendingVerifications();
    setLoading(false);
    if (error) {
      showToast(`Couldn't load: ${error}`, 'error');
      return;
    }
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

    showToast(`${req.user_name} ${decision === 'approved' ? 'verified ✓' : 'rejected'}`, 'success');
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
          <div className="text-4xl mb-2">🪪</div>
          <p className="text-sm font-bold text-gray-900 dark:text-white">No pending verifications</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">All caught up.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <VerificationCard
              key={req.request_id}
              req={req}
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

const VerificationCard: React.FC<{
  req: PendingVerification;
  onApprove: () => void;
  onReject: () => void;
}> = ({ req, onApprove, onReject }) => {
  const links: { label: string; icon: string; url: string | null }[] = [
    { label: 'LinkedIn', icon: '💼', url: req.linkedin_url },
    { label: 'Instagram', icon: '📷', url: req.instagram_url },
    { label: 'Facebook', icon: '👥', url: req.facebook_url },
    { label: 'Twitter', icon: '🐦', url: req.twitter_url },
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
            <div className="w-full h-full flex items-center justify-center text-2xl">👤</div>
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
              <span>{l.icon}</span>
              <span className="font-medium text-gray-700 dark:text-gray-300 truncate flex-1">{l.label}</span>
              <span className="text-blue-500">↗</span>
            </a>
          ) : (
            <div
              key={l.label}
              className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-zinc-900/50 border border-dashed border-gray-200 dark:border-zinc-700 rounded text-xs opacity-50"
            >
              <span>{l.icon}</span>
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
          className="flex-1 py-2 text-xs font-bold bg-blue-600 text-white rounded hover:bg-blue-700 shadow-sm"
        >
          ✓ Approve
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
            {decision === 'approved' ? '✓ Approve' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminVerificationsTab;
