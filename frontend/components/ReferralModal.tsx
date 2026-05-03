import React, { useState } from 'react';
import { X, Share2, AlertCircle, Loader2, CheckCircle } from 'lucide-react';
import { apiClient } from '../services/api';

interface ReferralModalProps {
  reportId: string | number;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ReferralModal({ reportId, onClose, onSuccess }: ReferralModalProps) {
  const [authority, setAuthority] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authorities = [
    { value: 'NPA', label: 'NPA (National Prosecuting Authority)' },
    { value: 'ZRP', label: 'ZRP (Zimbabwe Republic Police)' },
    { value: 'ZIMRA', label: 'ZIMRA (Zimbabwe Revenue Authority)' },
    { value: 'FIU', label: 'FIU (Financial Intelligence Unit)' },
    { value: 'Other', label: 'Other' }
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!authority) {
      setError('Please select a prosecuting authority.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      // Using the status update endpoint which handles referrals
      await apiClient.put(`/reports/${reportId}/status`, {
        status: 'REFERRED',
        referred_to_authority: authority,
        referral_notes: notes // Assuming the backend is updated to accept notes
      });

      // Optionally log this referral in the investigation ledger
      await apiClient.post(`/reports/${reportId}/logs`, {
        note: `[CASE REFERRED]: This dossier has been officially referred to ${authority}. \n\nReason/Notes: ${notes || 'No additional notes provided.'}`,
        metadata: { action: 'REFERRAL', authority }
      });

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to process case referral. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-[#0f172a] border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">

        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800 bg-slate-800/30">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 rounded-lg">
              <Share2 className="w-5 h-5 text-indigo-400" />
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">Refer Case to Authority</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded-full transition-colors text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-xl text-red-400 flex items-start gap-3 animate-in slide-in-from-top-2">
              <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          {/* Authority Selection */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              Prosecuting Authority <span className="text-red-500">*</span>
            </label>
            <select
              value={authority}
              onChange={(e) => setAuthority(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-4 focus:outline-none focus:border-indigo-500 transition-colors appearance-none cursor-pointer"
              required
            >
              <option value="">-- Select Authority --</option>
              {authorities.map((opt) => (
                <option key={opt.value} value={opt.label}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Referral Notes */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              Referral Notes / Justification
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Provide a brief explanation for the referral and any specific findings for the receiving authority..."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors min-h-[140px] resize-none"
            />
          </div>

          <div className="bg-indigo-900/10 border border-indigo-500/20 p-4 rounded-xl flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-indigo-400 mt-0.5 shrink-0" />
            <p className="text-xs text-indigo-300/80 leading-relaxed">
              Referring this case will change its status to <span className="font-bold text-indigo-300">REFERRED</span>.
              The selected authority will be granted secure access to the decrypted dossier for further action.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl font-bold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-[2] bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl flex items-center justify-center gap-2 transition-all font-bold shadow-lg shadow-indigo-600/20"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Processing Referral...</span>
                </>
              ) : (
                <>
                  <Share2 className="w-5 h-5" />
                  <span>Finalize Referral</span>
                </>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
