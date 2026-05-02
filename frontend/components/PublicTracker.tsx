import React, { useState } from 'react';
import { FileText, Search, Lock } from 'lucide-react';
import ReportForm from './ReportForm';
import PublicTracker from './PublicTracker';

export default function PublicPortal() {
  // State to manage which tab is currently active
  const [activeTab, setActiveTab] = useState<'report' | 'track'>('report');

  return (
    <div className="min-h-screen bg-[#0a0f1c] text-slate-200 py-12 px-4 sm:px-6 lg:px-8">
      
      {/* Header */}
      <div className="max-w-3xl mx-auto text-center mb-10">
        <h1 className="text-5xl font-extrabold text-white tracking-tight mb-2">
          <span className="text-blue-500">ZACC</span> Portal
        </h1>
        <p className="text-slate-400 font-mono text-sm uppercase tracking-widest mt-3">
          Secure. Anonymous. Protected.
        </p>
      </div>

      {/* Tab Navigation Container */}
      <div className="max-w-3xl mx-auto">
        <div className="bg-slate-800/50 rounded-t-2xl border border-slate-700 flex overflow-hidden">
          
          {/* File Report Tab */}
          <button
            onClick={() => setActiveTab('report')}
            className={`flex-1 py-4 flex items-center justify-center gap-2 font-bold transition-all duration-200 ${
              activeTab === 'report'
                ? 'bg-slate-900 text-blue-400 border-b-2 border-blue-500'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <FileText className="w-5 h-5" />
            FILE REPORT
          </button>

          {/* Track Case Tab */}
          <button
            onClick={() => setActiveTab('track')}
            className={`flex-1 py-4 flex items-center justify-center gap-2 font-bold transition-all duration-200 ${
              activeTab === 'track'
                ? 'bg-slate-900 text-blue-400 border-b-2 border-blue-500'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <Search className="w-5 h-5" />
            TRACK CASE
          </button>

        </div>

        {/* Dynamic Content Area */}
        <div className="bg-slate-900/30 rounded-b-2xl border-x border-b border-slate-700 p-6 sm:p-8 shadow-2xl backdrop-blur-sm">
          {activeTab === 'report' ? (
        <ReportForm 
            user={null} 
            language="en" 
            onSuccess={() => setActiveTab('track')} 
        />
        ) : (
        <PublicTracker />
        )}
        </div>
      </div>
      
      {/* Footer Security Badges */}
      <div className="max-w-3xl mx-auto mt-10 flex justify-center items-center gap-2 text-xs text-slate-500 font-mono uppercase tracking-wider">
        <Lock className="w-4 h-4 text-amber-500" />
        End-to-End Encrypted • Anonymity Guaranteed • Zero-Knowledge Architecture
      </div>

    </div>
  );
}