import React, { useState, useEffect } from 'react';
import { ArrowLeft, ShieldCheck, FileText, Send, Clock, User, CheckCircle, AlertCircle } from 'lucide-react';
import { apiClient } from '../services/api';

export default function AuthorityFeedbackView({ onBack }: { onBack: () => void }) {
  const [cases, setCases] = useState<any[]>([]);
  const [selectedCase, setSelectedCase] = useState<any>(null);
  const [feedback, setFeedback] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchReferredCases();
  }, []);

  const fetchReferredCases = async () => {
    try {
      setIsLoading(true);
      const data = await apiClient.getReports();
      setCases(Array.isArray(data) ? data : (data.data || []));
    } catch (err) {
      setError('Failed to load referred cases.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback.trim() || !selectedCase) return;

    try {
      setIsSubmitting(true);
      await apiClient.post(`/reports/${selectedCase.id}/logs`, {
        note: `[AUTHORITY FEEDBACK]: ${feedback}`,
        metadata: { is_authority_feedback: true }
      });

      alert('Feedback submitted successfully.');
      setFeedback('');
      setSelectedCase(null);
      fetchReferredCases();
    } catch (err) {
      console.error('Failed to submit feedback', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <div className="min-h-screen bg-[#0a0f1c] flex items-center justify-center text-blue-500 font-mono text-xl animate-pulse">Loading Referred Dossiers...</div>;

  return (
    <div className="min-h-screen bg-[#0a0f1c] p-8 font-sans text-slate-200">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-8 flex items-center justify-between border-b border-slate-800 pb-6">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-3xl font-mono font-bold text-white tracking-wider flex items-center gap-3">
                <ShieldCheck className="text-indigo-500 w-8 h-8" />
                Prosecuting Authority Portal
              </h1>
              <p className="text-slate-400 mt-1 italic">Authorized feedback loop for referred corruption cases</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/50 p-4 rounded-xl text-red-400 flex items-center gap-3">
            <AlertCircle className="w-5 h-5" /> {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Case List */}
          <div className="lg:col-span-1 space-y-4">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">Referred Cases</h2>
            {cases.length > 0 ? (
              cases.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setSelectedCase(c)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${selectedCase?.id === c.id ? 'bg-indigo-600/20 border-indigo-500 shadow-lg shadow-indigo-500/10' : 'bg-slate-800/40 border-slate-700 hover:border-slate-500'}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-mono font-bold text-white">{c.reference_code}</span>
                    <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded border border-indigo-500/30">REFERRED</span>
                  </div>
                  <p className="text-xs text-slate-400 line-clamp-2 mb-3">{c.type}</p>
                  <div className="flex justify-between items-center text-[10px] text-slate-500">
                    <span>{new Date(c.referral_date || c.updated_at).toLocaleDateString()}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Awaiting Feedback</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-slate-500 italic text-sm py-8 text-center border border-dashed border-slate-800 rounded-xl">No cases currently referred to your authority.</div>
            )}
          </div>

          {/* Case Detail & Feedback Form */}
          <div className="lg:col-span-2">
            {selectedCase ? (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">

                {/* Case Info Summary */}
                <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-6">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h2 className="text-2xl font-bold text-white mb-1">{selectedCase.reference_code}</h2>
                      <p className="text-indigo-400 font-semibold">{selectedCase.type}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-500 block mb-1">Institution Involved</span>
                      <span className="text-slate-200 font-medium">{selectedCase.institution}</span>
                    </div>
                  </div>

                  <div className="bg-[#050811] p-4 rounded-xl border border-slate-800 mb-6">
                    <h3 className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-2"><FileText className="w-3 h-3" /> Case Description</h3>
                    <p className="text-slate-300 text-sm leading-relaxed">{selectedCase.description || "Description is encrypted or unavailable."}</p>
                  </div>

                  {/* Feedback Form */}
                  <div className="border-t border-slate-700 pt-6">
                    <h3 className="text-lg font-bold text-white mb-4">Submit Authority Feedback</h3>
                    <form onSubmit={handleSubmitFeedback} className="space-y-4">
                      <textarea
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        placeholder="Provide details on prosecution progress, legal findings, or case resolution..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors min-h-[150px] resize-none"
                        required
                      />
                      <div className="flex justify-end gap-4">
                        <button
                          type="button"
                          onClick={() => setSelectedCase(null)}
                          className="px-6 py-2 text-slate-400 hover:text-white transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isSubmitting || !feedback.trim()}
                          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-2 rounded-lg flex items-center gap-2 transition-colors font-bold shadow-lg shadow-indigo-600/20"
                        >
                          {isSubmitting ? "Submitting..." : <><Send className="w-4 h-4" /> Finalize Feedback</>}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>

                <div className="bg-indigo-900/10 border border-indigo-500/20 p-4 rounded-xl flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-indigo-400 mt-0.5" />
                  <p className="text-xs text-indigo-300/80 leading-relaxed">
                    Submitting feedback will automatically update the case timeline visible to ZACC investigators.
                    Ensure all findings are accurate as this log entry is immutable for audit purposes.
                  </p>
                </div>

              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-600 border border-dashed border-slate-800 rounded-2xl p-12">
                <ShieldCheck className="w-16 h-16 mb-4 opacity-20" />
                <p className="text-lg font-medium">Select a case from the left to review and provide feedback.</p>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
