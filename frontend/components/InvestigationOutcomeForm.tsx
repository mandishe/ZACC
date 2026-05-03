import React, { useState } from 'react';
import { Send, Loader2, CheckCircle, AlertCircle, FileSearch } from 'lucide-react';
import { apiClient } from '../services/api';

interface InvestigationOutcomeFormProps {
  reportId: string | number;
  onSuccess: () => void;
}

export default function InvestigationOutcomeForm({ reportId, onSuccess }: InvestigationOutcomeFormProps) {
  const [outcome, setOutcome] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!outcome.trim()) return;

    try {
      setIsSubmitting(true);
      setError(null);

      // Log the outcome in the investigation ledger with a specific metadata flag
      await apiClient.post(`/reports/${reportId}/logs`, {
        note: `[INVESTIGATION OUTCOME]: ${outcome}`,
        metadata: { type: 'INVESTIGATION_OUTCOME' }
      });

      onSuccess();
      setOutcome('');
    } catch (err: any) {
      setError(err.message || 'Failed to save investigation outcome.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-6 mb-6">
      <h2 className="text-lg font-bold text-emerald-400 mb-4 flex items-center gap-2">
        <FileSearch className="w-5 h-5" /> Formal Investigation Outcome
      </h2>

      <p className="text-sm text-slate-400 mb-4 leading-relaxed">
        Before closing or referring this case, you must provide a formal summary of the investigation findings and the determined outcome.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          placeholder="Enter the detailed results of the investigation, evidence verified, and final recommendations..."
          className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors min-h-[120px] resize-none"
          required
        />

        {error && (
          <div className="text-red-400 text-xs flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !outcome.trim()}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg flex items-center gap-2 transition-all font-bold shadow-lg shadow-emerald-600/10"
        >
          {isSubmitting ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Saving Outcome...</>
          ) : (
            <><CheckCircle className="w-4 h-4" /> Save Final Outcome</>
          )}
        </button>
      </form>
    </div>
  );
}
