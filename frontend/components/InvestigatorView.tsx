import React, { useState, useEffect } from 'react';
import { ShieldAlert, FileText, AlertTriangle, Clock, Search, Filter, ChevronRight, Paperclip, Loader2 } from 'lucide-react';
import { fetchReports } from '../services/api';

// 1. Updated Interface to match your ACTUAL database columns
interface Report {
  id: number;
  reference_code: string; // was tracking_code
  type: string;           // was category
  ai_summary: any;        // changed to 'any' because it is now an object or null
  risk_score: number;     // was severity_score (appears to be out of 100)
  status: string;
  file_count?: number; 
  created_at: string;
}

export default function InvestigatorView({ user, onCaseViewed }: any) {
  const [reports, setReports] = useState<Report[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadReports = async () => {
      try {
        setIsLoading(true);
        const data = await fetchReports();
        setReports(data.data || data); 
      } catch (err: any) {
        setError(err.message || 'Failed to load intelligence data.');
      } finally {
        setIsLoading(false);
      }
    };
    loadReports();
  }, []);

  // 2. Adjusted severity thresholds for a 100-point scale
  const getSeverityColor = (score: number) => {
    if (score >= 80) return 'bg-red-500/20 text-red-400 border-red-500/30';
    if (score >= 50) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SUBMITTED': return 'text-blue-400';
      case 'REQUIRES ACTION': return 'text-red-400 font-bold';
      case 'UNDER REVIEW': return 'text-amber-400';
      default: return 'text-slate-400';
    }
  };

  // 3. Helper function to safely render the complex ai_summary object
  const renderAiSummary = (summary: any) => {
    if (!summary) return "No AI summary available.";
    if (typeof summary === 'string') return summary;
    
    // If it is the type_inference object from your database
    if (summary.type_inference) {
        return `Inferred Category: ${summary.type_inference.inferred_type} \nConfidence Level: ${summary.type_inference.confidence}% \n\nAdditional text analysis pending or restricted.`;
    }
    
    // Fallback: safely convert any other object to a string
    return JSON.stringify(summary, null, 2);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0f1c] flex flex-col items-center justify-center text-blue-500">
        <Loader2 className="w-12 h-12 animate-spin mb-4" />
        <h2 className="text-xl font-bold text-slate-300">Decrypting & Loading Case Files...</h2>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0f1c] flex items-center justify-center p-8">
        <div className="bg-red-500/10 border border-red-500/50 p-6 rounded-xl text-red-400 max-w-lg text-center">
          <AlertTriangle className="w-12 h-12 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Connection Error</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  // 4. Updated filter to use the correct database columns
  const filteredReports = reports.filter(r => 
    (r.reference_code || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.type || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#0a0f1c] p-8 font-sans text-slate-200">
      <div className="max-w-6xl mx-auto mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <ShieldAlert className="text-blue-500 w-8 h-8" />
              ZACC Intelligence Dashboard
            </h1>
            <p className="text-slate-400 mt-2">AI-Triage & Incident Overview</p>
          </div>
          
          <div className="flex gap-4">
            <div className="bg-slate-800/50 border border-slate-700 p-4 rounded-xl text-center">
              <div className="text-2xl font-bold text-red-400">
                {reports.filter(r => r.risk_score >= 80).length}
              </div>
              <div className="text-xs text-slate-400 uppercase tracking-wider">Critical</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 p-4 rounded-xl text-center">
              <div className="text-2xl font-bold text-blue-400">{reports.length}</div>
              <div className="text-xs text-slate-400 uppercase tracking-wider">Total Active</div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto mb-6 flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-500 w-5 h-5" />
          <input 
            type="text" 
            placeholder="Search by Reference Code or Category..." 
            className="w-full bg-slate-800/50 border border-slate-700 text-white rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:border-blue-500 transition-colors"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="max-w-6xl mx-auto grid gap-6">
        {filteredReports.map((report) => (
          <div key={report.id} className="bg-slate-800/40 border border-slate-700 rounded-2xl p-6 hover:bg-slate-800/60 transition-all group">
            
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-4">
                {/* Updated to use reference_code */}
                <span className="text-xl font-mono font-bold text-white tracking-wider bg-slate-900 px-3 py-1 rounded-lg border border-slate-700">
                  {report.reference_code || 'N/A'}
                </span>
                <span className="flex items-center gap-1 text-sm text-slate-400">
                  <Clock className="w-4 h-4" /> {new Date(report.created_at).toLocaleDateString()}
                </span>
              </div>
              
              <div className="flex items-center gap-3">
                <span className={`text-sm uppercase tracking-wider ${getStatusColor(report.status)}`}>
                  • {report.status}
                </span>
                {/* Updated to use risk_score and display out of 100 */}
                <div className={`px-4 py-1.5 rounded-full border flex items-center gap-2 ${getSeverityColor(report.risk_score)}`}>
                  <AlertTriangle className="w-4 h-4" />
                  <span className="font-bold text-sm">Severity: {report.risk_score || 0}/100</span>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                {/* Updated to use type */}
                <span className="text-xs font-bold uppercase tracking-wider text-blue-400 bg-blue-500/10 px-2 py-1 rounded">
                  AI Categorization: {report.type || 'Unclassified'}
                </span>
              </div>
              <div className="bg-[#050811] border border-slate-800 rounded-xl p-4">
                <h4 className="text-xs text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                  <FileText className="w-4 h-4" /> AI Generated Summary
                </h4>
                {/* Rendering via our safe helper function */}
                <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap font-mono">
                  {renderAiSummary(report.ai_summary)}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-700/50">
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <Paperclip className="w-4 h-4" />
                <span>{report.file_count || 0} Encrypted Evidence Files Attached</span>
              </div>
              
              <button 
                className="flex items-center gap-2 text-blue-400 hover:text-blue-300 font-medium transition-colors group-hover:translate-x-1 duration-200"
                onClick={() => onCaseViewed?.(report.id)}
              >
                Open Case Dashboard <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}
        
        {filteredReports.length === 0 && (
          <div className="text-center py-12 text-slate-500 border-2 border-dashed border-slate-700 rounded-2xl">
            <ShieldAlert className="w-12 h-12 mx-auto text-slate-600 mb-3" />
            <p>No active reports match your search criteria.</p>
          </div>
        )}
      </div>
    </div>
  );
}