import React from 'react';
import { BarChart3, Activity, AlertOctagon, TrendingUp } from 'lucide-react';

// In a real scenario, this data would be aggregated by your Laravel backend
// via an endpoint like /api/analytics/hotspots
const AGGREGATED_DATA = [
  { category: 'Embezzlement', count: 42, avgSeverity: 8.5, color: 'bg-red-500' },
  { category: 'Procurement Fraud', count: 38, avgSeverity: 7.8, color: 'bg-orange-500' },
  { category: 'Bribery', count: 65, avgSeverity: 6.2, color: 'bg-amber-500' },
  { category: 'Extortion', count: 24, avgSeverity: 7.0, color: 'bg-yellow-500' },
  { category: 'Conflict of Interest', count: 18, avgSeverity: 5.5, color: 'bg-blue-500' },
];

const MAX_COUNT = Math.max(...AGGREGATED_DATA.map(d => d.count));

export default function CorruptionHotspots() {
  return (
    <div className="min-h-screen bg-[#0a0f1c] p-8 font-sans text-slate-200">
      
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-8">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <Activity className="text-blue-500 w-8 h-8" />
          Analytics & Hotspots
        </h1>
        <p className="text-slate-400 mt-2">AI-driven macro analysis of corruption vectors</p>
      </div>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Severity Matrix */}
        <div className="lg:col-span-2 bg-slate-800/40 border border-slate-700 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-slate-400" />
            Report Volume by Category
          </h2>
          
          <div className="space-y-6">
            {AGGREGATED_DATA.sort((a, b) => b.count - a.count).map((item) => (
              <div key={item.category}>
                <div className="flex justify-between text-sm mb-2">
                  <span className="font-medium text-slate-300">{item.category}</span>
                  <span className="text-slate-400">{item.count} Reports</span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-3 border border-slate-700 overflow-hidden">
                  <div 
                    className={`h-full ${item.color} rounded-full transition-all duration-1000 ease-out relative overflow-hidden`}
                    style={{ width: `${(item.count / MAX_COUNT) * 100}%` }}
                  >
                    {/* Shimmer effect for design flair */}
                    <div className="absolute top-0 left-0 w-full h-full bg-white/20 animate-pulse"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: AI Severity Index */}
        <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <AlertOctagon className="w-5 h-5 text-red-400" />
            AI Severity Index
          </h2>
          
          <div className="space-y-4">
            {AGGREGATED_DATA.sort((a, b) => b.avgSeverity - a.avgSeverity).map((item) => (
              <div key={item.category} className="bg-[#050811] border border-slate-800 p-4 rounded-xl">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-bold text-slate-300">{item.category}</span>
                  <span className={`text-xs font-bold px-2 py-1 rounded-md ${
                    item.avgSeverity >= 8 ? 'bg-red-500/20 text-red-400' : 
                    item.avgSeverity >= 6 ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'
                  }`}>
                    {item.avgSeverity.toFixed(1)} / 10
                  </span>
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-1 mt-2">
                  <TrendingUp className="w-3 h-3" /> Average impact score assigned by AI
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}