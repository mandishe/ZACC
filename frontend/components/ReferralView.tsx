import React, { useState } from 'react';
import { ArrowLeft, ShieldCheck, Send, Loader2, CheckCircle, Info, Building2, Gavel, Landmark, ShieldAlert, MoreHorizontal } from 'lucide-react';
import { apiClient } from '../services/api';

interface ReferralViewProps {
  report: any;
  onBack: () => void;
  onSuccess: () => void;
}

export default function ReferralView({ report, onBack, onSuccess }: ReferralViewProps) {
  const [selectedAuthority, setSelectedAuthority] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authorities = [
    { id: 'ZRP', name: 'Zimbabwe Republic Police (ZRP)', icon: Building2, color: 'text-blue-400' },
    { id: 'NPA', name: 'National Prosecuting Authority (NPA)', icon: Gavel, color: 'text-emerald-400' },
    { id: 'ZIMRA', name: 'Zimbabwe Revenue Authority (ZIMRA)', icon: Landmark, color: 'text-amber-400' },
    { id: 'FIU', name: 'Financial Intelligence Unit (FIU)', icon: ShieldAlert, color: 'text-rose-400' },
    { id: 'OTHER', name: 'OTHER', icon: MoreHorizontal, color: 'text-slate-400' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAuthority) return;

    try {
      setIsSubmitting(true);
      setError(null);

      await apiClient.put(`/reports/${report.id}/status`, {
        status: 'REFERRED',
        referred_to_authority: selectedAuthority
      });

      await apiClient.post(`/reports/${report.id}/logs`, {
        note: `[OFFICIAL REFERRAL]: This case has been handed over to ${selectedAuthority}. \n\nInvestigator Notes: ${notes || 'No specific notes provided.'}`,
        metadata: { action: 'REFERRAL', authority: selectedAuthority }
      });

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to process referral.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0f1c] p-8 font-sans text-slate-200 animate-in fade-in duration-500">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-10 flex items-center justify-between border-b border-slate-800 pb-6">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-3xl font-mono font-bold text-white tracking-wider flex items-center gap-3">
                <ShieldCheck className="text-indigo-500 w-8 h-8" />
                Referral Protocol: {report.reference_code}
              </h1>
              <p className="text-slate-400 mt-1 italic">Selecting appropriate external authority for case prosecution</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-10">

          {/* Authority Selection List */}
          <div className="lg:col-span-7 space-y-6">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-[0.2em] mb-4">Select Prosecuting Authority</h2>
            <div className="grid grid-cols-1 gap-4">
              {authorities.map((auth) => (
                <div
                  key={auth.id}
                  onClick={() => setSelectedAuthority(auth.name)}
                  className={`relative p-6 rounded-2xl border cursor-pointer transition-all duration-300 group ${selectedAuthority === auth.name ? 'bg-indigo-600/20 border-indigo-500 shadow-lg shadow-indigo-500/10 scale-[1.02]' : 'bg-slate-800/40 border-slate-700 hover:border-slate-500'}`}
                >
                  <div className="flex items-center gap-5">
                    <div className={`p-4 rounded-xl bg-slate-900 border border-slate-800 group-hover:border-slate-600 transition-colors ${auth.color}`}>
                      <auth.icon className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-white">{auth.name}</h3>
                      <p className="text-xs text-slate-500 font-mono mt-1">Official state-authorized entity</p>
                    </div>
                  </div>
                  {selectedAuthority === auth.name && (
                    <div className="absolute right-6 top-1/2 -translate-y-1/2">
                      <CheckCircle className="w-6 h-6 text-indigo-400" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Justification & Action */}
          <div className="lg:col-span-5 space-y-8">
            <div className="bg-slate-800/40 border border-slate-700 rounded-3xl p-8 sticky top-8">
              <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                <Info className="w-5 h-5 text-indigo-400" /> Referral Justification
              </h3>

              <div className="space-y-4">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Detail the evidence and reasons why this case is being referred for external prosecution..."
                  className="w-full bg-slate-900/80 border border-slate-700 rounded-2xl p-5 text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors min-h-[200px] resize-none text-sm leading-relaxed"
                  required
                />

                {error && (
                  <p className="text-red-400 text-xs font-bold animate-pulse">{error}</p>
                )}

                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={isSubmitting || !selectedAuthority || !notes.trim()}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed text-white py-4 rounded-2xl flex items-center justify-center gap-3 transition-all font-bold text-lg shadow-xl shadow-indigo-600/20"
                  >
                    {isSubmitting ? (
                      <><Loader2 className="w-6 h-6 animate-spin" /> Processing Referral...</>
                    ) : (
                      <><Send className="w-5 h-5" /> Execute Referral</>
                    )}
                  </button>
                </div>
              </div>

              <div className="mt-8 p-4 bg-indigo-500/5 rounded-xl border border-indigo-500/10">
                <p className="text-[10px] text-indigo-300/60 uppercase font-black tracking-widest mb-2">Legal Disclaimer</p>
                <p className="text-xs text-slate-500 leading-relaxed italic">
                  Executing this referral transfers investigatory priority to the selected authority.
                  ZACC retains audit access but the primary prosecution will be handled externally.
                </p>
              </div>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
}
