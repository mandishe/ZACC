import React, { useState, useEffect } from 'react';
import { BarChart3, Activity, AlertOctagon, TrendingUp, Loader2, AlertTriangle } from 'lucide-react';
import { fetchHotspots } from '../services/api';

interface HotspotData {
  category: string;
  count: number;
  avgSeverity: number;
  color?: string; 
}

// A palette of Tailwind colors to assign dynamically to our chart bars
const CHART_COLORS = [
  'bg-red-500', 'bg-orange-500', 'bg-amber-500', 
  'bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-emerald-500'
];

export default function CorruptionHotspots() {
  const [data, setData] = useState<HotspotData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadAnalytics = async () => {
      try {
        setIsLoading(true);
        const rawData = await fetchHotspots();
        
        // Dynamically assign a color to each category for the charts
        const processedData = rawData.map((item: any, index: number) => ({
          ...item,
          color: CHART_COLORS[index % CHART_COLORS.length]
        }));
        
        setData(processedData);
      } catch (err: any) {
        setError(err.message || 'Failed to load analytics data.');
      } finally {
        setIsLoading(false);
      }
    };

    loadAnalytics();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0f1c] flex flex-col items-center justify-center text-blue-500">
        <Loader2 className="w-12 h-12 animate-spin mb-4" />
        <h2 className="text-xl font-bold text-slate-300">Compiling Threat Analytics...</h2>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0f1c] flex items-center justify-center p-8">
        <div className="bg-red-500/10 border border-red-500/50 p-6 rounded-xl text-red-400 max-w-lg text-center">
          <AlertTriangle className="w-12 h-12 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Analytics Offline</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  // Calculate the maximum count to scale the bar chart properly
  const MAX_COUNT = data.length > 0 ? Math.max(...data.map(d => d.count)) : 1;

  return (
    <div className="min-h-screen bg-[#0a0f1c] p-8 font-sans text-slate-200">
      
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-8">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <Activity className="text-blue-500 w-8 h-8" />
          Analytics & Hotspots
        </h1>
        <p className="text-slate-400 mt-2">Live AI-driven macro analysis of corruption vectors</p>
      </div>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Severity Matrix */}
        <div className="lg:col-span-2 bg-slate-800/40 border border-slate-700 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-slate-400" />
            Report Volume by Category
          </h2>
          
          {data.length === 0 ? (
             <div className="text-center py-12 text-slate-500">No sufficient data to generate charts.</div>
          ) : (
            <div className="space-y-6">
              {[...data].sort((a, b) => b.count - a.count).map((item) => (
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
                      <div className="absolute top-0 left-0 w-full h-full bg-white/20 animate-pulse"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: AI Severity Index */}
        <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <AlertOctagon className="w-5 h-5 text-red-400" />
            Average Risk Score
          </h2>
          
          <div className="space-y-4">
            {[...data].sort((a, b) => b.avgSeverity - a.avgSeverity).map((item) => (
              <div key={item.category} className="bg-[#050811] border border-slate-800 p-4 rounded-xl">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-bold text-slate-300">{item.category}</span>
                  <span className={`text-xs font-bold px-2 py-1 rounded-md ${
                    item.avgSeverity >= 80 ? 'bg-red-500/20 text-red-400' : 
                    item.avgSeverity >= 50 ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'
                  }`}>
                    {item.avgSeverity.toFixed(1)} / 100
                  </span>
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-1 mt-2">
                  <TrendingUp className="w-3 h-3" /> Based on {item.count} cases
                </div>
              </div>
            ))}
            
            {data.length === 0 && (
              <div className="text-center text-slate-500 text-sm mt-8">Insufficient data for index calculation.</div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}