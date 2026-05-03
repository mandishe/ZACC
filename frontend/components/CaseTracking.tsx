import React, { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { apiClient } from "../services/api";
import { User, CaseReport, CaseStatus } from "../types";
import BlockchainVerification from "./BlockchainVerification";

interface CaseTrackingProps {
  user: User;
  onCreateReport?: () => void;
}

export const CaseTracking: React.FC<CaseTrackingProps> = ({
  user,
  onCreateReport,
}) => {
  const [cases, setCases] = useState<CaseReport[]>([]);
  const [disputingId, setDisputingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [disputeFiles, setDisputeFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportGeneratingId, setReportGeneratingId] = useState<string | null>(null);

  const loadCases = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.getReports();

      if (response.success) {
        // Map API response to match frontend types
        const mappedCases = response.data.map((report: any) => ({
          id: report.case_id,
          timestamp: report.created_at,
          type: report.type,
          description: report.description,
          location: report.location,
          institution: report.institution,
          status: report.status,
          riskScore: report.risk_score,
          priority: report.priority,
          reporterId: report.user_id,
          referenceCode: report.reference_code,
          disputeReason: report.dispute_reason,
          lastUpdated: report.last_updated,
          attachments_count: report.attachments_count ?? report.attachments?.length ?? 0,
          blockchain_tx_hash: report.blockchain_tx_hash,
          blockchain_block_number: report.blockchain_block_number,
          referred_to_authority: report.referred_to_authority, // ADDED FIELD
        }));
        setCases(mappedCases);
      } else {
        throw new Error(response.message || "Failed to load reports");
      }
    } catch (err: any) {
      console.error("Error loading cases:", err);
      toast.error(err.message || "Failed to load your reports. Please try again.");
      setError(err.message || "Failed to load your reports. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCases();
  }, [user.id]);

  const handleDispute = async (caseId: string) => {
    if (!reason.trim() || reason.length < 10) {
      toast.error(
        "Please provide a more detailed reason (minimum 10 characters) for the dispute.",
      );
      return;
    }

    setIsSubmitting(true);

    try {
      // Find the report from the case_id
      const report = cases.find((c) => c.id === caseId);
      if (!report) {
        throw new Error("Report not found");
      }

      // Use publicDispute which supports evidence file uploads
      const trackingCode = report.referenceCode || caseId;
      const response = await apiClient.publicDispute(trackingCode, reason, disputeFiles);

      if (response.success) {
        toast.success("Dispute submitted successfully. Your case is being reviewed.");
        setDisputingId(null);
        setReason("");
        setDisputeFiles([]);
        await loadCases(); // Reload cases to get updated data
      } else {
        throw new Error(response.message || "Failed to submit dispute");
      }
    } catch (err: any) {
      console.error("Error submitting dispute:", err);
      toast.error(err.message || "Failed to submit dispute. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const stages = [
    { key: CaseStatus.SUBMITTED, label: "Submitted", icon: "📥" },
    { key: CaseStatus.UNDER_REVIEW, label: "Reviewing", icon: "🔎" },
    { key: CaseStatus.INVESTIGATING, label: "Investigation", icon: "🔍" },
    { key: CaseStatus.REFERRED, label: "Other Authorities", icon: "⚖️" },
    { key: CaseStatus.SUCCESSFUL, label: "✓ Successful", icon: "🏆" },
    { key: CaseStatus.CLOSED, label: "Closed", icon: "✅" },
  ];

  const getStatusIndex = (status: CaseStatus) => {
    if (status === CaseStatus.DISPUTED) return 2; // Show it back at 'Investigation' stage
    return stages.findIndex((s) => s.key === status);
  };

  const generateOutcomeReport = async (c: CaseReport) => {
    setReportGeneratingId(c.id);
    try {
      const now = new Date();
      const reportRef = `ZACC-OUTCOME-${(c.referenceCode || c.id || "CASE").replace(/[^A-Za-z0-9-]/g, "")}-${now.getFullYear()}`;
      const statusLabel = c.status === CaseStatus.SUCCESSFUL ? "SUCCESSFUL" : "CLOSED";
      const statusMeaning =
        c.status === CaseStatus.SUCCESSFUL
          ? "Case concluded with successful enforcement or corrective action by competent authorities."
          : "Case concluded and closed based on available evidence and investigative findings.";

      const esc = (v: unknown) =>
        String(v ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\"/g, "&quot;")
          .replace(/'/g, "&#39;")
          .replace(/\n/g, "<br/>");

      const [detailResp, stagesResp] = await Promise.all([
        apiClient.get(`/reports/${encodeURIComponent(c.id)}`).catch(() => null),
        apiClient.getStageEvaluations(c.id).catch(() => null),
      ]);

      const detailed = detailResp?.success ? detailResp.data : null;
      const stageRows = Array.isArray(stagesResp?.data)
        ? [...stagesResp.data].sort(
            (a: any, b: any) =>
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
          )
        : [];

      const narrative =
        detailed?.decrypted_data?.description ||
        detailed?.description ||
        c.description ||
        "No narrative available.";

      const stageHistoryHtml =
        stageRows.length === 0
          ? "<div class=\"box\"><span class=\"muted\">No stage history records available.</span></div>"
          : `<table class="stage-table"><thead><tr><th>Stage</th><th>Date</th><th>Officer</th><th>Score</th></tr></thead><tbody>${stageRows
              .map(
                (s: any) =>
                  `<tr><td>${esc((s.stage || "N/A").replace(/_/g, " "))}</td><td>${esc(new Date(s.created_at).toLocaleString())}</td><td>${esc(s.investigator?.name || "Investigator")}</td><td>${esc(s.final_score ?? "-")}</td></tr>${s.investigator_notes ? `<tr><td colspan="4"><div class="notes"><strong>Notes:</strong> ${esc(s.investigator_notes)}</div></td></tr>` : ""}`,
              )
              .join("")}</tbody></table>`;

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>ZACC Outcome Report - ${esc(c.referenceCode || c.id)}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    body { font-family: Arial, sans-serif; color: #111827; margin: 0; }
    .page { max-width: 780px; margin: 0 auto; }
    .header { border-bottom: 3px solid #0f766e; padding-bottom: 14px; margin-bottom: 18px; }
    .title { font-size: 20px; font-weight: 800; letter-spacing: 0.6px; color: #0f172a; }
    .sub { font-size: 12px; color: #475569; margin-top: 4px; }
    .badge { display: inline-block; margin-top: 8px; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; border: 1px solid #94a3b8; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 16px 0; }
    .card { border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px; }
    .label { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
    .value { font-size: 14px; font-weight: 700; color: #0f172a; }
    .section { margin-top: 16px; }
    .section h3 { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #0f766e; margin: 0 0 8px; }
    .box { border: 1px solid #d1d5db; border-radius: 10px; padding: 12px; background: #f8fafc; }
    .stage-table { width: 100%; border-collapse: collapse; border: 1px solid #d1d5db; border-radius: 8px; overflow: hidden; }
    .stage-table th { text-align: left; padding: 8px; font-size: 11px; background: #0f172a; color: #fff; }
    .stage-table td { padding: 8px; font-size: 11px; border-top: 1px solid #e2e8f0; vertical-align: top; }
    .notes { font-size: 11px; color: #334155; line-height: 1.5; }
    .muted { color: #64748b; font-size: 12px; }
    .footer { margin-top: 28px; border-top: 1px solid #cbd5e1; padding-top: 12px; font-size: 11px; color: #64748b; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="title">Zimbabwe Anti-Corruption Commission</div>
      <div class="sub">Official Case Outcome Report</div>
      <div class="badge">${statusLabel}</div>
    </div>

    <div class="meta">
      <div class="card">
        <div class="label">Case Reference</div>
        <div class="value">${esc(c.referenceCode || c.id)}</div>
      </div>
      <div class="card">
        <div class="label">Case ID</div>
        <div class="value">${esc(c.id)}</div>
      </div>
      <div class="card">
        <div class="label">Corruption Type</div>
        <div class="value">${esc(c.type || "N/A")}</div>
      </div>
      <div class="card">
        <div class="label">Priority / Risk</div>
        <div class="value">${esc(c.priority)} / ${esc(c.riskScore ?? 0)}%</div>
      </div>
      <div class="card">
        <div class="label">Institution</div>
        <div class="value">${esc(c.institution || "N/A")}</div>
      </div>
      <div class="card">
        <div class="label">Filed Date</div>
        <div class="value">${esc(new Date(c.timestamp).toLocaleString())}</div>
      </div>
    </div>

    <div class="section">
      <h3>Outcome Statement</h3>
      <div class="box">
        <div>${esc(statusMeaning)}</div>
        <div class="muted" style="margin-top: 8px;">Last Updated: ${esc(c.lastUpdated ? new Date(c.lastUpdated).toLocaleString() : "N/A")}</div>
      </div>
    </div>

    <div class="section">
      <h3>Case Narrative (Submitted)</h3>
      <div class="box">
        ${esc(narrative)}
      </div>
    </div>

    <div class="section">
      <h3>Investigation Stage History and Notes</h3>
      ${stageHistoryHtml}
    </div>

    <div class="footer">
      <span>Report Ref: ${esc(reportRef)}</span>
      <span>Generated: ${esc(now.toLocaleString())}</span>
    </div>
  </div>
  <script>window.onload=()=>setTimeout(()=>window.print(),450);</script>
</body>
</html>`;

      const w = window.open("", "_blank");
      if (!w) {
        toast.error("Popup blocked. Please allow popups to generate report.");
        return;
      }
      w.document.write(html);
      w.document.close();
      toast.success("Outcome report generated.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to generate outcome report.");
    } finally {
      setReportGeneratingId(null);
    }
  };

  if (loading) {
    return (
      <div className="zacc-surface p-10 sm:p-16 rounded-3xl text-center max-w-2xl mx-auto">
        <div className="w-20 h-20 bg-[var(--zacc-card-soft)] rounded-3xl flex items-center justify-center text-4xl mx-auto mb-8 animate-pulse">
          📊
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
          Loading your reports...
        </h2>
        <p className="text-slate-500 font-medium">
          Please wait while we fetch your data.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="zacc-surface p-10 sm:p-16 rounded-3xl text-center max-w-2xl mx-auto">
        <div className="w-20 h-20 bg-rose-500/10 rounded-3xl flex items-center justify-center text-4xl mx-auto mb-8">
          ⚠️
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
          Error Loading Reports
        </h2>
        <p className="text-slate-500 font-medium mb-8">{error}</p>
        <button
          onClick={loadCases}
          className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-blue-700 transition-all"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (cases.length === 0) {
    return (
      <div className="zacc-surface p-10 sm:p-16 rounded-3xl text-center max-w-2xl mx-auto">
        <div className="w-20 h-20 bg-[var(--zacc-card-soft)] rounded-3xl flex items-center justify-center text-4xl mx-auto mb-8 opacity-50">
          📊
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
          No submissions yet
        </h2>
        <p className="text-slate-500 font-medium leading-relaxed max-w-xs mx-auto mb-10">
          When you report an incident, it will appear here so you can monitor
          its progress in real-time.
        </p>
        <button
          className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-blue-700 transition-all"
          onClick={onCreateReport}
        >
          Create My First Report
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8 max-w-5xl mx-auto pb-14 sm:pb-20">
      <div className="zacc-surface p-5 sm:p-8 rounded-3xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">My Submissions</h2>
          <p className="text-[var(--zacc-muted)] font-medium">
            Tracking {cases.length} active investigation pipeline
            {cases.length > 1 ? "s" : ""}.
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-blue-500/10 rounded-full border border-blue-300/30 dark:border-blue-400/30">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
          <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300 uppercase tracking-widest">
            Active Sync
          </span>
        </div>
      </div>

      <div className="grid gap-6">
        {cases.map((c) => (
          <div
            key={c.id}
            className={`zacc-surface p-5 sm:p-8 rounded-3xl transition-all duration-300 border ${c.status === CaseStatus.DISPUTED ? "border-rose-500/30 shadow-[0_0_30px_rgba(244,63,94,0.05)]" : "hover:border-blue-400/40"}`}
          >
            <div className="flex flex-col md:flex-row gap-6 sm:gap-8 mb-8 sm:mb-10">
              <div className="flex-1">
                <div className="flex items-center gap-4 mb-3">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                    {c.id}
                  </h3>
                  <span
                    className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest border ${
                      c.status === CaseStatus.DISPUTED
                        ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                        : "bg-white/5 text-slate-400 border-white/5"
                    }`}
                  >
                    {c.status.replace("_", " ")}
                  </span>
                  {c.status === CaseStatus.DISPUTED && (
                    <span className="text-[10px] font-bold text-rose-400 animate-pulse uppercase tracking-widest">
                      ⚠️ Unsolved / Re-triggered
                    </span>
                  )}
                  {c.attachments_count && c.attachments_count > 0 && (
                    <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      📎 {c.attachments_count} file{c.attachments_count !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">
                  {c.institution} • {new Date(c.timestamp).toLocaleDateString()}
                </p>
                <div className="p-5 bg-[var(--zacc-card-soft)] rounded-2xl border border-[var(--zacc-border)]">
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium italic">
                    "{c.description}"
                  </p>
                </div>
              </div>

              <div className="md:w-48 text-right shrink-0">
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-2">
                  Tracking Code
                </p>
                <p className="font-mono font-bold text-blue-700 dark:text-blue-300 bg-blue-500/10 border border-blue-300/30 dark:border-blue-400/30 px-4 py-2 rounded-xl text-lg tracking-tight inline-block">
                  {c.referenceCode}
                </p>
              </div>
            </div>

            <div className="pt-8 border-t border-white/5">
              <div className="relative flex justify-between items-center px-2">
                <div className="absolute left-6 right-6 h-0.5 bg-white/5 top-1/2 -translate-y-1/2 z-0 rounded-full" />
                <div
                  className={`absolute left-6 h-1 top-1/2 -translate-y-1/2 z-0 transition-all duration-700 ease-in-out rounded-full shadow-[0_0_15px_rgba(16,185,129,0.3)] ${
                    c.status === CaseStatus.DISPUTED
                      ? "bg-rose-500 shadow-rose-500/30"
                      : "bg-nexus-emerald"
                  }`}
                  style={{
                    width: `calc(${(getStatusIndex(c.status) / (stages.length - 1)) * 100}% - 12px)`,
                  }}
                />

                {stages.map((s, idx) => {
                  const isActive = idx <= getStatusIndex(c.status);
                  const isCurrent =
                    s.key === c.status ||
                    (c.status === CaseStatus.DISPUTED &&
                      s.key === CaseStatus.INVESTIGATING);
                  return (
                    <div
                      key={s.key}
                      className="relative z-10 flex flex-col items-center"
                    >
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-all duration-500 ${
                          isCurrent
                            ? c.status === CaseStatus.DISPUTED
                              ? "bg-rose-500 text-white scale-125 ring-4 ring-rose-500/10"
                              : "bg-nexus-emerald text-nexus-950 scale-125 soft-glow ring-4 ring-nexus-emerald/10"
                            : isActive
                              ? "bg-nexus-emerald/10 border border-nexus-emerald/20 text-nexus-emerald"
                              : "bg-nexus-950 border border-white/5 text-slate-700"
                        }`}
                      >
                        {c.status === CaseStatus.DISPUTED &&
                        s.key === CaseStatus.INVESTIGATING
                          ? "⚠️"
                          : s.icon}
                      </div>
                      <p
                        className={`text-[9px] font-bold uppercase mt-4 tracking-widest text-center transition-colors ${
                          isCurrent
                            ? "text-white"
                            : isActive
                              ? "text-nexus-emerald"
                              : "text-slate-700"
                        }`}
                      >
                        {s.label}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Blockchain Verification Section */}
              <BlockchainVerification reportId={c.id} />

              {(c.status === CaseStatus.REFERRED) && (
                <div className="mt-6 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 px-4 py-3 animate-in fade-in slide-in-from-top-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-1">
                    Official Handover
                  </p>
                  <p className="text-sm text-slate-200 leading-relaxed">
                    This case has been officially handed over to <span className="font-bold text-white">{c.referred_to_authority}</span> for further legal proceedings and external prosecution. ZACC will continue to monitor the progress.
                  </p>
                </div>
              )}

              {(c.status === CaseStatus.SUCCESSFUL || c.status === CaseStatus.CLOSED) && (
                <div className="mt-6 rounded-2xl border border-slate-200/10 bg-nexus-950/40 px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                    Brief Outcome
                  </p>
                  <p className="text-sm text-slate-200">
                    {c.status === CaseStatus.SUCCESSFUL
                      ? "This case concluded with successful action after investigation and referral handling."
                      : "This case was closed after review based on available findings and evidence."}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {c.lastUpdated
                      ? `Updated: ${new Date(c.lastUpdated).toLocaleString()}`
                      : "Updated date not available."}
                  </p>
                </div>
              )}

              {/* Success Outcome Display (Shown when SUCCESSFUL) */}
              {c.status === CaseStatus.SUCCESSFUL && (
                <div className="mt-8 p-8 bg-gradient-to-br from-emerald-500/10 to-transparent rounded-[32px] border border-emerald-500/20 shadow-xl shadow-emerald-500/5 animate-fade-in relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none text-6xl">
                    🏆
                  </div>

                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 bg-emerald-500 text-white rounded-2xl flex items-center justify-center text-2xl shadow-lg shadow-emerald-500/30 group-hover:scale-110 transition-transform">
                      🏆
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-white uppercase tracking-[0.1em] leading-none">
                        Case Successfully Resolved
                      </h4>
                      <p className="text-[10px] text-emerald-400 font-black uppercase tracking-wider mt-1.5 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        Action taken against corrupt parties
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="p-5 bg-nexus-950/80 rounded-2xl border border-emerald-500/10 backdrop-blur-xl">
                      <p className="text-[9px] font-black text-emerald-400/80 uppercase tracking-[0.2em] mb-3">
                        Investigation Outcome
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="text-center">
                          <p className="text-xl">📥</p>
                          <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider mt-1">Submitted</p>
                          <p className="text-[9px] text-slate-500">✓ Complete</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xl">🔎</p>
                          <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider mt-1">Reviewed</p>
                          <p className="text-[9px] text-slate-500">✓ Complete</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xl">🔍</p>
                          <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider mt-1">Investigated</p>
                          <p className="text-[9px] text-slate-500">✓ Complete</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xl">🏆</p>
                          <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider mt-1">Successful</p>
                          <p className="text-[9px] text-slate-500">✓ Resolved</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 px-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                        Your report made a difference. Thank you for your courage.
                      </p>
                    </div>
                    {c.lastUpdated && (
                      <p className="text-[10px] text-slate-600 font-bold uppercase tracking-tighter px-2">
                        Resolved: {new Date(c.lastUpdated).toLocaleString()}
                      </p>
                    )}
                    <div className="pt-2">
                      <button
                        onClick={() => generateOutcomeReport(c)}
                        disabled={reportGeneratingId === c.id}
                        className="px-5 py-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/30 transition-all disabled:opacity-60"
                      >
                        {reportGeneratingId === c.id ? "Generating..." : "Generate Success Report"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Dispute Input Section (Shown when CLOSED) */}
              {c.status === CaseStatus.CLOSED && (
                <div className="mt-10 p-6 bg-rose-500/5 rounded-3xl border border-rose-500/10 animate-fade-in overflow-hidden transition-all duration-500">
                  <div className="flex items-center justify-end mb-4">
                    <button
                      onClick={() => generateOutcomeReport(c)}
                      disabled={reportGeneratingId === c.id}
                      className="px-5 py-2.5 rounded-xl bg-slate-800/70 border border-slate-700 text-slate-200 text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all disabled:opacity-60"
                    >
                      {reportGeneratingId === c.id ? "Generating..." : "Generate Closure Report"}
                    </button>
                  </div>
                  {disputingId === c.id ? (
                    <div className="space-y-5">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black text-rose-400 uppercase tracking-widest">
                          Reason for Resolution Dispute
                        </label>
                        <span
                          className={`text-[9px] font-bold ${reason.length >= 10 ? "text-emerald-500" : "text-slate-500"}`}
                        >
                          {reason.length} / 10 characters minimum
                        </span>
                      </div>
                      <textarea
                        className="w-full bg-nexus-950 border border-rose-500/20 rounded-2xl p-5 text-sm text-white focus:outline-none focus:border-rose-500/50 transition-all placeholder:text-slate-700"
                        placeholder="Explain why you believe this case was handled incorrectly or if you suspect foul play by investigators..."
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={4}
                        disabled={isSubmitting}
                      />

                      {/* Evidence file upload for dispute */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-rose-400/70 uppercase tracking-widest">
                          Supporting Evidence (optional)
                        </label>
                        <div className="flex items-center gap-3">
                          <label className="cursor-pointer px-4 py-2.5 bg-nexus-950 border border-rose-500/20 rounded-xl text-[11px] font-bold text-rose-300 hover:border-rose-500/40 transition-all flex items-center gap-2">
                            <span>📎</span> Attach Files
                            <input
                              type="file"
                              multiple
                              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                              className="hidden"
                              onChange={(e) => {
                                const files = Array.from(e.target.files || []);
                                setDisputeFiles((prev) => [...prev, ...files].slice(0, 10));
                                e.target.value = "";
                              }}
                              disabled={isSubmitting}
                            />
                          </label>
                          <span className="text-[10px] text-slate-600">
                            Images, videos, audio, PDFs, documents — max 10 files, 10MB each
                          </span>
                        </div>
                        {disputeFiles.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {disputeFiles.map((f, i) => (
                              <div key={i} className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/20 rounded-lg px-2.5 py-1.5 text-[10px] text-rose-300 font-medium">
                                <span>{f.type.startsWith("image/") ? "🖼️" : f.type.startsWith("video/") ? "🎬" : f.type.startsWith("audio/") ? "🎵" : "📄"}</span>
                                <span className="max-w-[120px] truncate">{f.name}</span>
                                <span className="text-rose-500/50">{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                                <button
                                  onClick={() => setDisputeFiles((prev) => prev.filter((_, j) => j !== i))}
                                  className="ml-1 text-rose-400 hover:text-rose-300 font-bold"
                                >×</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex gap-3">
                        <button
                          onClick={() => handleDispute(c.id)}
                          disabled={isSubmitting || reason.length < 10}
                          className="flex-1 py-4 bg-rose-500 text-white rounded-xl text-xs font-bold hover:bg-rose-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {isSubmitting ? (
                            <>
                              <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                              Processing Dispute...
                            </>
                          ) : (
                            "Submit Formal Dispute & Re-trigger Audit"
                          )}
                        </button>
                        <button
                          onClick={() => {
                            setDisputingId(null);
                            setReason("");
                            setDisputeFiles([]);
                          }}
                          disabled={isSubmitting}
                          className="px-8 py-4 bg-white/5 text-slate-400 rounded-xl text-xs font-bold hover:bg-white/10 transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col md:flex-row items-center justify-between gap-8">
                      <div className="text-left flex-1">
                        <h4 className="text-sm font-black text-white mb-2 flex items-center gap-2">
                          <span className="text-rose-500">🛡️</span>
                          Is this resolution unsatisfactory?
                        </h4>
                        <p className="text-xs text-slate-500 font-medium leading-relaxed max-w-lg">
                          If you have evidence that this case was not solved
                          properly, or if you suspect internal interference, you
                          have the right to challenge the outcome.
                        </p>
                      </div>
                      <button
                        onClick={() => setDisputingId(c.id)}
                        className="whitespace-nowrap px-8 py-4 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all group"
                      >
                        Challenge Outcome
                        <span className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          →
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Prominent Dispute Reason Display (Shown when DISPUTED) */}
              {c.status === CaseStatus.DISPUTED && (
                <div className="mt-8 p-8 bg-gradient-to-br from-rose-500/10 to-transparent rounded-[32px] border border-rose-500/20 shadow-xl shadow-rose-500/5 animate-fade-in relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none text-6xl">
                    🚨
                  </div>

                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 bg-rose-500 text-white rounded-2xl flex items-center justify-center text-2xl shadow-lg shadow-rose-500/30 group-hover:scale-110 transition-transform">
                      🚨
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-white uppercase tracking-[0.1em] leading-none">
                        Formal Integrity Dispute Active
                      </h4>
                      <p className="text-[10px] text-rose-400 font-black uppercase tracking-wider mt-1.5 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                        Status: Re-triggered for Oversight Audit
                      </p>
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div className="p-6 bg-nexus-950/80 rounded-2xl border border-rose-500/10 backdrop-blur-xl relative">
                      <p className="text-[9px] font-black text-rose-400/80 uppercase tracking-[0.2em] mb-4 flex items-center justify-between">
                        Whistleblower's Statement of Contention
                        <span className="text-slate-600 font-bold tracking-normal italic">
                          Verified Transmission
                        </span>
                      </p>
                      <p className="text-base text-slate-100 leading-relaxed font-semibold italic">
                        "{c.disputeReason}"
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-4 px-2 py-1">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></div>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                          Undergoing Priority Integrity Review
                        </p>
                      </div>
                      <div className="hidden sm:block h-1 w-1 bg-slate-800 rounded-full"></div>
                      <p className="text-[10px] text-slate-600 font-bold uppercase tracking-tighter">
                        Last Updated:{" "}
                        {c.lastUpdated
                          ? new Date(c.lastUpdated).toLocaleString()
                          : "N/A"}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
