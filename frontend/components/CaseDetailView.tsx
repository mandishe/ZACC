import React, { useState, useEffect } from 'react';
import { ArrowLeft, ShieldCheck, FileText, Paperclip, Download, AlertTriangle, CheckCircle, Lock } from 'lucide-react';
import { fetchReportDetails } from '../services/api';

export default function CaseDetailView({ caseId, onBack }: { caseId: number | string, onBack: () => void }) {
  const [report, setReport] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadReport = async () => {
      try {
        setIsLoading(true);
        const data = await fetchReportDetails(caseId);
        setReport(data);
      } catch (err: any) {
        setError(err.message || 'Failed to decrypt case files.');
      } finally {
        setIsLoading(false);
      }
    };
    loadReport();
  }, [caseId]);

  const renderAiSummary = (summary: any) => {
    if (!summary) return "No AI summary available.";
    if (typeof summary === 'string') return summary;
    if (summary.type_inference) {
        return `Inferred Category: ${summary.type_inference.inferred_type}\nConfidence Level: ${summary.type_inference.confidence}%\n\nDetailed text analysis restricted pending manual review.`;
    }
    return JSON.stringify(summary, null, 2);
  };

  if (isLoading) return <div className="min-h-screen bg-[#0a0f1c] flex items-center justify-center text-blue-500 font-mono">Decrypting Case {caseId}...</div>;
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
        
        {/* Left Column: AI Analysis & Original Text */}
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
                {report.decrypted_data?.description || report.description || "No text description provided by the whistleblower."}
              </p>
            </div>
          </div>

        </div>

        {/* Right Column: Evidence & Actions */}
        <div className="space-y-6">
          
          {/* Status Control */}
          <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-6">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Case Status</h3>
            <select className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg p-3 focus:outline-none focus:border-blue-500">
              <option value="SUBMITTED">Submitted</option>
              <option value="UNDER REVIEW">Under Review</option>
              <option value="REQUIRES ACTION">Requires Action</option>
              <option value="CLOSED">Closed</option>
            </select>
            <button className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors flex justify-center items-center gap-2">
              <CheckCircle className="w-5 h-5" /> Update Status
            </button>
          </div>

          {/* Evidence Files */}
          <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-6">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Paperclip className="w-4 h-4" /> Evidence Log
            </h3>
            
            <div className="space-y-3">
              {report.attachments && report.attachments.length > 0 ? (
                report.attachments.map((file: any) => (
                  <div key={file.id} className="flex items-center justify-between bg-slate-900 p-3 rounded-lg border border-slate-700">
                    <span className="text-sm text-slate-300 truncate pr-4" title={file.original_name}>
                      {file.original_name}
                    </span>
                    <a
                      href={file.download_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 p-2 bg-blue-500/10 rounded-md transition-colors"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-slate-500 text-sm italic">
                  No evidence files attached to this case.
                </div>
              )}
            </div>
            
          </div>
        </div>

      </div>
    </div>
  );
}