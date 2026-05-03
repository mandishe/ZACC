import React, { useState, useEffect, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { apiClient } from "../services/api";
import { CaseReport, CaseStatus } from "../types";


const COLORS = ["#2563eb", "#38bdf8", "#22c55e", "#f59e0b", "#ef4444"];


export const Dashboard: React.FC = () => {
  const [cases, setCases] = useState<CaseReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCases = async () => {
      try {
        const response = await apiClient.getReports();
        const data = Array.isArray(response) ? response : (response?.data || []);

        setCases(
          data.map((r: any) => ({
            id: r.case_id || r.id,
            case_id: r.case_id,
            timestamp: r.created_at,
            type: r.type,
            status: r.status,
            riskScore: r.risk_score,
            priority: r.priority,
            institution: r.institution,
            description: r.description || "",
            location: r.location || "",
            reporterId: r.user_id,
            referenceCode: r.reference_code,
          })),
        );
      } catch (err) {
        console.error("Dashboard fetch error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchCases();
  }, []);

  const stats = [
    {
      label: "Total Reports",
      value: cases.length,
      icon: "📁",
      accent: "border-l-blue-500",
      color: "text-slate-900 dark:text-white",
    },
    {
      label: "Active Pipeline",
      value: cases.filter((c) => !["CLOSED", "DISPUTED"].includes(c.status))
        .length,
      icon: "🕘",
      accent: "border-l-amber-400",
      color: "text-slate-900 dark:text-white",
    },
    {
      label: "Integrity Alerts",
      value: cases.filter((c) => c.status === CaseStatus.DISPUTED).length,
      icon: "🔎",
      accent: "border-l-cyan-400",
      color: "text-rose-400",
    },
    {
      label: "Finalized Dossiers",
      value: cases.filter((c) => c.status === CaseStatus.CLOSED).length,
      icon: "✔",
      accent: "border-l-emerald-500",
      color: "text-slate-900 dark:text-white",
    },
  ];

  const distributionData = useMemo(() => {
    const counts: Record<string, number> = {};
    cases.forEach((c) => {
      counts[c.type] = (counts[c.type] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [cases]);

  const trendData = useMemo(() => {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const now = new Date();
    const buckets: { year: number; month: number; name: string; value: number }[] = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        year: d.getFullYear(),
        month: d.getMonth(),
        name: `${monthNames[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`,
        value: 0,
      });
    }

    for (const c of cases) {
      const t = new Date(c.timestamp);
      const hit = buckets.find((b) => b.year === t.getFullYear() && b.month === t.getMonth());
      if (hit) hit.value += 1;
    }

    return buckets.map((b) => ({ name: b.name, value: b.value }));
  }, [cases]);

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <div
            key={i}
            className={`glass-card p-6 rounded-3xl transition-all duration-300 border-l-4 ${stat.label === "Integrity Alerts" && stat.value > 0 ? "border-l-rose-500" : stat.accent}`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {stat.label}
              </span>
              <span className="w-9 h-9 rounded-xl bg-[var(--zacc-card-soft)] border border-[var(--zacc-border)] flex items-center justify-center text-base">
                {stat.icon}
              </span>
            </div>
            <p className={`text-3xl font-bold mb-1 ${stat.color}`}>
              {loading ? "—" : stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 glass-card p-8 rounded-4xl">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Monthly Trend
            </h3>
            <div className="flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
              <span className="text-[10px] font-bold text-blue-600 dark:text-blue-300 uppercase">
                Live Intelligence
              </span>
            </div>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={280} minHeight={220}>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="rgba(255,255,255,0.05)"
                />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "#64748b", fontWeight: 600 }}
                  dy={10}
                />
                <YAxis hide />
                <Tooltip
                  contentStyle={{
                    background: "#1e293b",
                    border: "none",
                    borderRadius: "12px",
                    fontSize: "12px",
                    fontWeight: 600,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#2563eb"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorVal)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-4 glass-card p-6 rounded-4xl">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">
            Type Distribution
          </h3>
          {distributionData.length > 0 ? (
            <>
              <div className="h-[160px] mb-4">
                <ResponsiveContainer width="100%" height="100%" minWidth={220} minHeight={140}>
                  <PieChart>
                    <Pie
                      data={distributionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {distributionData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {distributionData.map((item, i) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ background: COLORS[i % COLORS.length] }}
                      ></div>
                      <span className="text-xs text-slate-400 font-medium truncate max-w-[120px]">
                        {item.name}
                      </span>
                    </div>
                    <span className="text-xs font-black text-slate-900 dark:text-white">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-slate-500 text-sm text-center py-10">
              No data yet.
            </p>
          )}
        </div>
      </div>

    </div>
  );
};
