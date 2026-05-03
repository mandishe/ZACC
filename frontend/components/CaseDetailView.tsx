import React, { useState, useEffect } from 'react';
import { ArrowLeft, ShieldCheck, FileText, Paperclip, Download, AlertTriangle, CheckCircle, Lock, MessageSquare, Send, Clock, User, Share2 } from 'lucide-react';
import { fetchReportDetails, apiClient } from '../services/api';

export default function CaseDetailView({ caseId, onBack }: { caseId: number | string, onBack: () => void }) {
  const [report, setReport] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [newNote, setNewNote] = useState('');
  const [referredAuthority, setReferredAuthority] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const [reportData, logsData] = await Promise.all([
          fetchReportDetails(caseId),
          apiClient.get(`/reports/${caseId}/logs`)
        ]);
        setReport(reportData);
        setLogs(logsData);
        if (reportData.referred_to_authority) {
          setReferredAuthority(reportData.referred_to_authority);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load case details.');
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [caseId]);

  const handleStatusUpdate = async (newStatus: string) => {
    if (newStatus === 'REFERRED' && !referredAuthority) {
      alert('Please select an authority for referral.');
      return;
    }

    try {
      const data = await apiClient.put(`/reports/${caseId}/status`, {
        status: newStatus,
        referred_to_authority: newStatus === 'REFERRED' ? referredAuthority : null
      });
      setReport({ ...report, status: data.status, referred_to_authority: data.referred_to_authority });
    } catch (err) {
      console.error('Failed to update status', err);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;

    try {
      setIsSubmittingNote(true);
      const log = await apiClient.post(`/reports/${caseId}/logs`, { note: newNote });
      setLogs([log, ...logs]);
      setNewNote('');
    } catch (err) {
      console.error('Failed to add note', err);
    } finally {
      setIsSubmittingNote(false);
    }
  };

  const renderAiSummary = (summary: any) => {
    if (!summary) return "No AI summary available.";
    if (typeof summary === 'string') return summary;
    if (summary.type_inference) {
        return `Inferred Category: ${summary.type_inference.inferred_type}\nConfidence Level: ${summary.type_inference.confidence}%\n\nDetailed text analysis restricted pending manual review.`;
    }
    return JSON.stringify(summary, null, 2);
  };

  if (isLoading) return <div className="min-h-screen bg-[#0a0f1c] flex items-center justify-center text-blue-500 font-mono text-xl animate-pulse">Decrypting Case {caseId}...</div>;
  if (error) return <div className="min-h-screen bg-[#0a0f1c] text-red-500 flex items-center justify-center">{error}</div>;
  if (!report) return null;

  return (
    <div className="min-h-screen bg-[#0a0f1c] p-8 font-sans text-slate-200">
      
      {/* Header & Back Button */}
      <div className="max-w-6xl mx-auto mb-8 flex items-center justify-between border-b border-slate-800 pb-6">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-3xl font-mono font-bold text-white tracking-wider flex items-center gap-3">
              <ShieldCheck className="text-emerald-500 w-8 h-8" />
              {report.reference_code || `CASE-${report.id}`}
            </h1>
            <p className="text-slate-400 mt-1 flex items-center gap-2">
              <Lock className="w-4 h-4" /> End-to-End Encrypted Dossier
            </p>
          </div>
        </div>
        
        <div className={`px-6 py-2 rounded-lg border flex items-center gap-2 ${report.risk_score >= 80 ? 'bg-red-500/20 text-red-400 border-red-500/50' : 'bg-amber-500/20 text-amber-400 border-amber-500/50'}`}>
          <AlertTriangle className="w-5 h-5" />
          <span className="font-bold text-lg">Severity: {report.risk_score || 0}/100</span>
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: AI Analysis & Original Text & Investigation Logs */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* AI Insights Card */}
          <div className="bg-blue-900/10 border border-blue-500/30 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-blue-400 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5" /> AI Intelligence Summary
            </h2>
            <div className="bg-[#050811] p-4 rounded-xl border border-slate-800">
              <p className="text-slate-300 font-mono text-sm whitespace-pre-wrap leading-relaxed">
                {renderAiSummary(report.ai_summary)}
              </p>
            </div>
          </div>

          {/* Original Whistleblower Description */}
          <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">Original Submission Text</h2>
            <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-700/50">
              <p className="text-slate-300 leading-relaxed">
                {report.description || "No text description provided."}
              </p>
            </div>
          </div>

          {/* Internal Ledger / Investigation Logs */}
          <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-indigo-400" /> Internal Investigation Ledger
            </h2>

            {/* New Note Form */}
            <form onSubmit={handleAddNote} className="mb-8">
              <div className="relative">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Record your findings or internal notes..."
                  className="w-full bg-slate-900/80 border border-slate-700 rounded-xl p-4 text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors min-h-[100px] resize-none"
                />
                <button
                  type="submit"
                  disabled={isSubmittingNote || !newNote.trim()}
                  className="absolute bottom-4 right-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors font-bold"
                >
                  {isSubmittingNote ? "Logging..." : <><Send className="w-4 h-4" /> Log Entry</>}
                </button>
              </div>
            </form>

            {/* Timeline */}
            <div className="space-y-6 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-px before:bg-slate-700">
              {logs.length > 0 ? (
                logs.map((log) => (
                  <div key={log.id} className="pl-10 relative">
                    <div className="absolute left-0 top-1 w-8 h-8 bg-slate-800 border border-slate-700 rounded-full flex items-center justify-center z-10">
                      <User className="w-4 h-4 text-slate-400" />
                    </div>
                    <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-bold text-slate-300">{log.user?.name} <span className="text-xs text-slate-500 font-normal ml-2">({log.user?.role})</span></span>
                        <span className="text-xs text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(log.created_at).toLocaleString()}</span>
                      </div>
                      <p className="text-slate-400 text-sm leading-relaxed">{log.note}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="pl-10 py-4 text-slate-500 italic text-sm">No notes have been recorded for this case yet.</div>
              )}
            </div>
          </div>

        </div>

        {/* Right Column: Evidence & Actions */}
        <div className="space-y-6">
          
          {/* Status Control */}
          <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-6">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Case Status & Referral</h3>
            <div className="space-y-4">
              <select
                value={report.status}
                onChange={(e) => handleStatusUpdate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg p-3 focus:outline-none focus:border-blue-500 transition-colors cursor-pointer"
              >
                <option value="SUBMITTED">Submitted</option>
                <option value="UNDER_REVIEW">Under Review</option>
                <option value="INVESTIGATING">Investigating</option>
                <option value="REFERRED">Referred to Authority</option>
                <option value="CLOSED">Closed</option>
                <option value="DISPUTED">Disputed</option>
              </select>

              {report.status === 'REFERRED' && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                    <Share2 className="w-3 h-3" /> Prosecuting Authority
                  </label>
                  <select
                    value={referredAuthority}
                    onChange={(e) => {
                      setReferredAuthority(e.target.value);
                      // Auto-update if already referred
                      if (report.status === 'REFERRED') {
                        handleStatusUpdate('REFERRED');
                      }
                    }}
                    className="w-full bg-slate-900/50 border border-indigo-500/50 text-white rounded-lg p-3 focus:outline-none focus:border-indigo-500 transition-colors"
                  >
                    <option value="">-- Select Authority --</option>
                    <option value="Zimbabwe Republic Police (ZRP)">Zimbabwe Republic Police (ZRP)</option>
                    <option value="National Prosecuting Authority (NPA)">National Prosecuting Authority (NPA)</option>
                    <option value="Financial Intelligence Unit (FIU)">Financial Intelligence Unit (FIU)</option>
                    <option value="Special Anti-Corruption Unit (SACU)">Special Anti-Corruption Unit (SACU)</option>
                  </select>
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-slate-500">
                <CheckCircle className="w-3 h-3 text-emerald-500" /> Changes are persisted automatically
              </div>
            </div>
          </div>

          {/* Evidence Files */}
          <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-6">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Paperclip className="w-4 h-4" /> Evidence Log
            </h3>
            
            <div className="space-y-3">
              {report.attachments && report.attachments.length > 0 ? (
                report.attachments.map((attachment: any) => (
                  <div key={attachment.id} className="flex items-center justify-between bg-slate-900 p-3 rounded-lg border border-slate-700">
                    <span className="text-sm text-slate-300 truncate pr-4" title={attachment.original_name}>{attachment.original_name}</span>
                    <a
                      href={`/api/reports/${report.id}/attachments/${attachment.id}/download`}
                      className="text-blue-400 hover:text-blue-300 p-2 bg-blue-500/10 rounded-md transition-colors"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  </div>
                ))
              ) : (
                <p className="text-slate-500 text-sm italic">No evidence files attached.</p>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
