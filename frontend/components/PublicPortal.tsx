import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { apiClient } from "../services/api";
import { User, UserRole } from "../types";
import { Language, t } from "../i18n";
import {
  Area,
  AreaChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";

interface PublicPortalProps {
  onLogin: (user: User) => void;
  language: Language;
  onLanguageChange: (language: Language) => void;
  themeMode: "system" | "light" | "dark";
  onThemeModeChange: (themeMode: "system" | "light" | "dark") => void;
}

type PortalTab = "signin" | "report" | "tracking";

const STATUS_ORDER_DEFAULT = ["SUBMITTED", "UNDER_REVIEW", "INVESTIGATING", "REFERRED", "CLOSED"];
const STATUS_ORDER_SUCCESSFUL = ["SUBMITTED", "UNDER_REVIEW", "INVESTIGATING", "SUCCESSFUL"];

const getStatusOrder = (status: string) =>
  status === "SUCCESSFUL" ? STATUS_ORDER_SUCCESSFUL : STATUS_ORDER_DEFAULT;

const statusLabel = (s: string) =>
  s === "UNDER_REVIEW" ? "Under Review" : s === "INVESTIGATING" ? "Investigating" : s === "REFERRED" ? "Referred" : s === "SUCCESSFUL" ? "✓ Successful" : s.charAt(0) + s.slice(1).toLowerCase();

const statusColor = (s: string) => {
  if (s === "SUBMITTED") return "text-blue-600 dark:text-blue-400";
  if (s === "UNDER_REVIEW") return "text-indigo-600 dark:text-indigo-400";
  if (s === "INVESTIGATING") return "text-amber-600 dark:text-amber-400";
  if (s === "REFERRED") return "text-purple-600 dark:text-purple-400";
  if (s === "SUCCESSFUL") return "text-teal-600 dark:text-teal-400";
  if (s === "CLOSED") return "text-emerald-600 dark:text-emerald-400";
  if (s === "DISPUTED") return "text-rose-600 dark:text-rose-400";
  return "text-slate-600 dark:text-slate-400";
};

const ACCEPTED_MIME = "image/jpeg,image/png,image/gif,image/webp,audio/mpeg,audio/wav,audio/ogg,video/mp4,video/quicktime,video/x-msvideo,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain";

function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

// Zimbabwe provinces with towns mapped
const PORTAL_PROVINCE_LOCATIONS: Record<string, string[]> = {
  "Harare Province": ["Harare", "Chitungwiza", "Epworth", "Ruwa", "Norton"],
  "Bulawayo Province": ["Bulawayo"],
  "Manicaland": [
    "Mutare", "Rusape", "Chipinge", "Nyanga", "Chimanimani",
    "Buhera", "Murambinda", "Penhalonga", "Headlands", "Hauna",
    "Nyazura", "Odzi", "Sakubva", "Dangamvura", "Chisumbanje",
  ],
  "Mashonaland Central": [
    "Bindura", "Mount Darwin", "Shamva", "Mvurwi", "Concession",
    "Mazowe", "Rushinga", "Centenary", "Guruve", "Glendale",
  ],
  "Mashonaland East": [
    "Marondera", "Chivhu", "Macheke", "Goromonzi", "Seke",
    "Murehwa", "Mutoko", "Mudzi",
  ],
  "Mashonaland West": [
    "Chinhoyi", "Kadoma", "Chegutu", "Karoi", "Kariba",
    "Mhangura", "Banket", "Raffingora", "Tengwe", "Zvimba",
    "Chirundu", "Makuti", "Sanyati",
  ],
  "Masvingo Province": [
    "Masvingo", "Chiredzi", "Bikita", "Gutu", "Zaka",
    "Chivi", "Mwenezi", "Ngundu", "Triangle", "Hippo Valley",
    "Nemamwa", "Buffalo Range", "Chatsworth",
  ],
  "Matabeleland North": [
    "Hwange", "Victoria Falls", "Lupane", "Nkayi", "Tsholotsho",
    "Inyathi", "Dete",
  ],
  "Matabeleland South": [
    "Gwanda", "Beitbridge", "Plumtree", "Filabusi",
    "West Nicholson", "Esigodini",
  ],
  "Midlands": [
    "Gweru", "Kwekwe", "Zvishavane", "Shurugwi", "Redcliff",
    "Gokwe", "Gokwe South", "Gokwe North", "Mvuma", "Mashava", "Mberengwa",
  ],
};

const PORTAL_PROVINCES = Object.keys(PORTAL_PROVINCE_LOCATIONS);
const PORTAL_ALL_LOCATIONS = PORTAL_PROVINCES.flatMap(p =>
  PORTAL_PROVINCE_LOCATIONS[p].map(t => `${t}, ${p}`)
);

function portalFuzzyMatch(query: string, text: string): { match: boolean; score: number } {
  const q = query.toLowerCase();
  const tl = text.toLowerCase();
  if (tl.startsWith(q)) return { match: true, score: 3 };
  if (tl.includes(q)) return { match: true, score: 2 };
  let qi = 0;
  for (let i = 0; i < tl.length && qi < q.length; i++) {
    if (tl[i] === q[qi]) qi++;
  }
  if (qi === q.length) return { match: true, score: 1 };
  return { match: false, score: 0 };
}

function generateWhistleblowerPDF(trackedCase: any, stage: any, idx: number) {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>ZACC Stage Report – ${trackedCase.reference_code}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:Arial,sans-serif;color:#111;padding:48px;background:#fff;position:relative;}
    .watermark{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-45deg);font-size:72px;color:rgba(0,0,0,0.04);pointer-events:none;white-space:nowrap;font-weight:900;letter-spacing:4px;}
    .header{border-bottom:3px solid #059669;padding-bottom:20px;margin-bottom:32px;display:flex;align-items:center;gap:16px;}
    .header-logo{width:56px;height:56px;border-radius:50%;object-fit:cover;flex-shrink:0;}
    .header h1{font-size:22px;font-weight:900;color:#059669;letter-spacing:2px;text-transform:uppercase;}
    .header h2{font-size:15px;color:#444;margin-top:4px;}
    .confid{font-size:11px;font-weight:700;color:#e11d48;letter-spacing:3px;text-transform:uppercase;margin-top:6px;}
    .section{margin-bottom:28px;}
    .label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#666;margin-bottom:4px;}
    .value{font-size:14px;color:#111;}
    .notes-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;font-size:13px;line-height:1.6;margin-top:6px;}
    .row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;margin-bottom:24px;}
    .footer{margin-top:48px;border-top:1px solid #e2e8f0;padding-top:16px;font-size:11px;color:#888;text-align:center;}
    @media print{.no-print{display:none;}}
  </style>
</head>
<body>
<div class="watermark">CONFIDENTIAL</div>
<div class="header">
  <img class="header-logo" src="${window.location.origin}/zacc-logo.png" alt="ZACC"/>
  <div>
  <h1>Zimbabwe Anti-Corruption Commission</h1>
  <h2>Case Stage Report</h2>
  <div class="confid">Confidential – For Official Use Only</div>
  </div>
</div>
<div class="row">
  <div><div class="label">Case Reference</div><div class="value" style="font-weight:700;color:#059669;">${trackedCase.reference_code}</div></div>
  <div><div class="label">Case ID</div><div class="value">${trackedCase.case_id}</div></div>
  <div><div class="label">Report Generated</div><div class="value">${new Date().toLocaleString()}</div></div>
</div>
<div class="row">
  <div><div class="label">Stage</div><div class="value" style="font-weight:700;">${statusLabel(stage.stage)}</div></div>
  <div><div class="label">Stage Recorded</div><div class="value">${new Date(stage.created_at).toLocaleString()}</div></div>
  <div><div class="label">Assessment Score</div><div class="value">${stage.final_score ?? "—"} / 100</div></div>
</div>
<div class="section">
  <div class="label">Stage Notes</div>
  <div class="notes-box">${stage.investigator_notes || "No notes recorded."}</div>
</div>
<p style="font-size:11px;color:#999;margin-top:8px;">Note: Investigator identity is withheld to protect the integrity of the investigation process.</p>
<div class="footer">Generated by ZACC Integrity Management System · ${new Date().toLocaleDateString()} · Document #${trackedCase.case_id}-STAGE-${idx + 1}</div>
<script>window.onload=()=>setTimeout(()=>window.print(),400);</script>
</body>
</html>`;
  win.document.write(html);
  win.document.close();
}

export const PublicPortal: React.FC<PublicPortalProps> = ({
  onLogin,
  language,
  onLanguageChange,
  themeMode,
  onThemeModeChange,
}) => {
  const isDarkTheme = useMemo(() => {
    if (themeMode === "dark") return true;
    if (themeMode === "light") return false;
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }, [themeMode]);

  const portalFieldTone = isDarkTheme
    ? "bg-[var(--zacc-card-soft)] border-white/10 text-white"
    : "bg-white border-slate-300 text-slate-900";

  const portalFieldStyle = useMemo<React.CSSProperties>(
    () => ({
      backgroundColor: isDarkTheme ? "var(--zacc-card-soft)" : "#ffffff",
      color: isDarkTheme ? "#e2e8f0" : "#0f172a",
      borderColor: isDarkTheme ? "rgba(255, 255, 255, 0.1)" : "#cbd5e1",
      colorScheme: isDarkTheme ? "dark" : "light",
    }),
    [isDarkTheme],
  );

  const [tab, setTab] = useState<PortalTab>(
    window.location.pathname.startsWith("/staff") ? "signin" : "report"
  );
  
  useEffect(() => {
    if (tab === "signin") {
      window.history.replaceState(null, "", "/staff");
    } else if (window.location.pathname.startsWith("/staff")) {
      window.history.replaceState(null, "", "/");
    }
  }, [tab]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Sign in state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showStaffPassword, setShowStaffPassword] = useState(false);

  // Report form state
  const [formData, setFormData] = useState({
    // type: "Bribery",
    institution: "",
    location: "",
    description: "",
  });
  const [submitted, setSubmitted] = useState<any | null>(null);
  const [publicStats, setPublicStats] = useState<any | null>(null);

  // Initial report evidence (optional on first submission)
  const [reportFiles, setReportFiles] = useState<File[]>([]);
  const [reportFileError, setReportFileError] = useState<string | null>(null);
  const [reportUploadNotice, setReportUploadNotice] = useState<string | null>(null);
  const [reportSubmittedEvidenceCount, setReportSubmittedEvidenceCount] = useState(0);
  const reportFileInputRef = useRef<HTMLInputElement>(null);

  // Location autocomplete
  const [locationSuggestions, setLocationSuggestions] = useState<string[]>([]);
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [portalProvince, setPortalProvince] = useState("");

  // Pre-submission suggestions
  const [portalPreSuggestions, setPortalPreSuggestions] = useState<any>(null);
  const [portalPreSuggestionsLoading, setPortalPreSuggestionsLoading] = useState(false);

  const handleLocationInput = (value: string) => {
    setFormData(prev => ({ ...prev, location: value }));
    if (value.trim().length >= 1) {
      const pool = portalProvince
        ? PORTAL_PROVINCE_LOCATIONS[portalProvince].map(t => `${t}, ${portalProvince}`)
        : PORTAL_ALL_LOCATIONS;
      const results = pool
        .map(loc => ({ loc, ...portalFuzzyMatch(value, loc) }))
        .filter(r => r.match)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map(r => r.loc);
      setLocationSuggestions(results);
      setShowLocationDropdown(results.length > 0);
    } else {
      setLocationSuggestions([]);
      setShowLocationDropdown(false);
    }
  };

  const selectPortalLocation = (loc: string) => {
    setFormData(prev => ({ ...prev, location: loc }));
    setShowLocationDropdown(false);
  };

  const handlePortalProvinceChange = (province: string) => {
    setPortalProvince(province);
    setFormData(prev => ({ ...prev, location: "" }));
    setLocationSuggestions([]);
    setShowLocationDropdown(false);
  };

  // Tracking state
  const [trackingCode, setTrackingCode] = useState("");
  const [trackedCase, setTrackedCase] = useState<any | null>(null);

  // Evidence upload state
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [evidenceUploading, setEvidenceUploading] = useState(false);
  const [evidenceSuccess, setEvidenceSuccess] = useState<string | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const evidenceInputRef = useRef<HTMLInputElement>(null);

  // Dispute state
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeFiles, setDisputeFiles] = useState<File[]>([]);
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);
  const [disputeSuccess, setDisputeSuccess] = useState(false);
  const [disputeError, setDisputeError] = useState<string | null>(null);
  const disputeInputRef = useRef<HTMLInputElement>(null);

  const resetMessages = () => { setError(null); };

  useEffect(() => {
    const loadStats = async () => {
      try {
        const response = await apiClient.getPublicStats();
        if (response?.success) {
          setPublicStats(response.data);
        }
      } catch {
        // non-blocking visual widget
      }
    };
    loadStats();
  }, []);

  const integritySeries = useMemo(() => {
    const status = publicStats?.by_status || {};
    return [
      { stage: "Submitted", value: status.SUBMITTED || 0 },
      { stage: "Review", value: status.UNDER_REVIEW || 0 },
      { stage: "Investigating", value: status.INVESTIGATING || 0 },
      { stage: "Closed", value: status.CLOSED || 0 },
      { stage: "Disputed", value: status.DISPUTED || 0 },
    ];
  }, [publicStats]);

  const integrityDonut = useMemo(() => {
    if (!publicStats) return [];
    return [
      { name: "Resolved", value: Number(publicStats.resolved_total || 0) },
      { name: "Active", value: Number(publicStats.active_investigations || 0) },
      { name: "Disputed", value: Number(publicStats.by_status?.DISPUTED || 0) },
    ];
  }, [publicStats]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    resetMessages();
    try {
      const { user } = await apiClient.login(email, password);
      if (user.role === UserRole.WHISTLEBLOWER) {
        setError("Whistleblowers do not log in here. Use the 'Track Case' tab with your tracking code.");
        await apiClient.logout().catch(() => {});
        localStorage.removeItem("nexus_token");
        localStorage.removeItem("nexus_user");
        setLoading(false);
        return;
      }
      onLogin(user);
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const getPortalPreSuggestions = async () => {
    if (formData.description.trim().length < 10) return;
    setPortalPreSuggestionsLoading(true);
    try {
      const resp = await apiClient.preSubmissionSuggestions({
        //type: formData.type,
        description: formData.description,
        institution: formData.institution,
        location: formData.location,
      });
      if (resp.success) setPortalPreSuggestions(resp.data);
    } catch {
      // Silently fail
    } finally {
      setPortalPreSuggestionsLoading(false);
    }
  };

  const handleAnonymousSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.description.trim().length < 20) {
      setError("Description must be at least 20 characters.");
      return;
    }
    setLoading(true);
    resetMessages();
    try {
      const selectedEvidenceCount = reportFiles.length;
      // UNIFIED SUBMISSION: Pass description, institution, location, and files in one go.
      const response = await apiClient.createAnonymousReport({
        ...formData,
        files: reportFiles
      });

      if (!response.success) throw new Error(response.message || "Failed to submit report");

      let uploadNotice: string | null = null;
      if (selectedEvidenceCount > 0) {
        uploadNotice = `${selectedEvidenceCount} evidence file${selectedEvidenceCount === 1 ? "" : "s"} uploaded with your report.`;
      }

      setReportUploadNotice(uploadNotice);
      setReportSubmittedEvidenceCount(selectedEvidenceCount);
      setSubmitted(response.data);
      setReportFiles([]);
      setReportFileError(null);
      setFormData({ institution: "", location: "", description: "" });
    } catch (err: any) {
      setError(err.message || "Failed to submit report");
    } finally {
      setLoading(false);
    }
  };

  const handleReportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    const remaining = 10 - reportFiles.length;

    if (remaining <= 0) {
      setReportFileError("You can only attach up to 10 files.");
      return;
    }

    const tooLarge = selected.filter((f) => f.size > 10 * 1024 * 1024);
    const valid = selected.filter((f) => f.size <= 10 * 1024 * 1024).slice(0, remaining);

    if (tooLarge.length > 0) {
      setReportFileError(`${tooLarge.length} file(s) exceeded 10MB and were skipped.`);
    } else {
      setReportFileError(null);
    }

    setReportFiles((prev) => [...prev, ...valid].slice(0, 10));
    if (reportFileInputRef.current) reportFileInputRef.current.value = "";
  };

  const removeReportFile = (index: number) => {
    setReportFiles((prev) => prev.filter((_, i) => i !== index));
    setReportFileError(null);
  };

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackingCode.trim()) return;
    setLoading(true);
    resetMessages();
    setTrackedCase(null);
    setEvidenceFiles([]);
    setEvidenceSuccess(null);
    setEvidenceError(null);
    setDisputeOpen(false);
    setDisputeSuccess(false);
    try {
      const response = await apiClient.trackCase(trackingCode.trim());
      if (!response.success) throw new Error(response.message || "Case not found");
      setTrackedCase(response.data);
    } catch (err: any) {
      setError(err.message || "Unable to track this case");
    } finally {
      setLoading(false);
    }
  };

  const handleEvidenceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const maxReach = 10 - (trackedCase?.attachments_count ?? 0);
    const valid = files.filter(f => f.size <= 10 * 1024 * 1024).slice(0, maxReach);
    const oversized = files.filter(f => f.size > 10 * 1024 * 1024);
    if (oversized.length > 0) setEvidenceError(`${oversized.length} file(s) exceed the 10MB limit and were excluded.`);
    else setEvidenceError(null);
    setEvidenceFiles(prev => {
      const combined = [...prev, ...valid];
      return combined.slice(0, maxReach);
    });
  };

  const removeEvidenceFile = (index: number) => {
    setEvidenceFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleEvidenceUpload = async () => {
    if (evidenceFiles.length === 0 || !trackedCase) return;
    setEvidenceUploading(true);
    setEvidenceError(null);
    try {
      const response = await apiClient.uploadEvidence(
        trackedCase.reference_code,
        evidenceFiles,
      );
      if (!response.success) throw new Error(response.message || "Upload failed");
      setEvidenceSuccess(`${evidenceFiles.length} file(s) uploaded successfully.`);
      setEvidenceFiles([]);
      setTrackedCase((prev: any) => ({ ...prev, attachments_count: response.data.total_attachments }));
    } catch (err: any) {
      setEvidenceError(err.message || "Failed to upload files");
    } finally {
      setEvidenceUploading(false);
    }
  };

  const handleDisputeFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.size <= 10 * 1024 * 1024).slice(0, 10);
    setDisputeFiles(prev => [...prev, ...files].slice(0, 10));
  };

  const handleDisputeSubmit = async () => {
    if (!disputeReason.trim() || disputeReason.trim().length < 10) {
      setDisputeError("Please provide a dispute reason (at least 10 characters).");
      return;
    }
    setDisputeSubmitting(true);
    setDisputeError(null);
    try {
      const response = await apiClient.publicDispute(
        trackedCase.reference_code,
        disputeReason,
        disputeFiles,
      );
      if (!response.success) throw new Error(response.message || "Failed to submit dispute");
      setDisputeSuccess(true);
      setTrackedCase((prev: any) => ({ ...prev, status: "DISPUTED" }));
    } catch (err: any) {
      setDisputeError(err.message || "Failed to submit dispute");
    } finally {
      setDisputeSubmitting(false);
    }
  };

  const currentStatusOrder = getStatusOrder(trackedCase?.status ?? "SUBMITTED");
  const activeStatusIdx = currentStatusOrder.indexOf(trackedCase?.status ?? "SUBMITTED");
  const maxEvidenceReach = 10 - (trackedCase?.attachments_count ?? 0);

  const orderedStageEvaluations = useMemo(() => {
    if (!Array.isArray(trackedCase?.stage_evaluations)) return [];
    return [...trackedCase.stage_evaluations].sort(
      (a: any, b: any) =>
        new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime(),
    );
  }, [trackedCase]);

  const finalOutcomeStage = useMemo(() => {
    if (orderedStageEvaluations.length === 0) return null;
    return (
      [...orderedStageEvaluations]
        .reverse()
        .find((s: any) => ["SUCCESSFUL", "CLOSED"].includes(String(s.stage))) ||
      null
    );
  }, [orderedStageEvaluations]);

  return (
    <div className="min-h-screen bg-[var(--zacc-bg)] text-[var(--zacc-text)] flex flex-col items-center justify-start px-3 sm:px-4 py-6 sm:py-8">
      {/* Settings Bar */}
      <div className="w-full max-w-5xl flex justify-end gap-2 mb-4 sm:mb-5">
        <select value={themeMode} onChange={e => onThemeModeChange(e.target.value as any)}
          className="px-3 py-2 rounded-lg bg-[var(--zacc-card)] border border-[var(--zacc-border)] text-xs font-semibold">
          <option value="system">{t(language, "system")}</option>
          <option value="light">{t(language, "light")}</option>
          <option value="dark">{t(language, "dark")}</option>
        </select>
        <select value={language} onChange={e => onLanguageChange(e.target.value as Language)}
          className="px-3 py-2 rounded-lg bg-[var(--zacc-card)] border border-[var(--zacc-border)] text-xs font-semibold">
          <option value="en">English</option>
          <option value="sn">Shona</option>
          <option value="nd">Ndebele</option>
          <option value="to">Tonga</option>
        </select>
      </div>

      {/* Logo */}
      <div className="mb-6 sm:mb-8 text-center max-w-xl">
        <img src="/zacc-logo.png" alt="ZACC" className="w-36 h-36 mx-auto mb-5 rounded-2xl object-cover shadow-lg border border-[var(--zacc-border)]" />
        <h1 className="text-4xl md:text-5xl font-black mb-2 bg-gradient-to-r from-blue-700 to-blue-500 dark:from-blue-300 dark:to-cyan-300 bg-clip-text text-transparent">{t(language, "portalTitle")}</h1>
        <p className="text-sm text-[var(--zacc-muted)] font-medium">{t(language, "portalSubtitle")}</p>
      </div>

      {/* Main Card */}
      <div className="w-full max-w-6xl rounded-3xl border border-[var(--zacc-border)] bg-[var(--zacc-card)] shadow-2xl overflow-hidden">
        {/* Tabs */}
        {tab !== "signin" && (
          <div className="grid grid-cols-2 border-b border-[var(--zacc-border)] bg-[var(--zacc-card-soft)]">
            {[
              { id: "report", label: t(language, "fileReport"), icon: "📝" },
              { id: "tracking", label: t(language, "trackCase"), icon: "🔍" },
            ].map(item => (
              <button key={item.id} onClick={() => { setTab(item.id as PortalTab); setError(null); }}
                className={`px-4 py-4 font-bold text-xs uppercase tracking-wider transition-all relative ${tab === item.id ? "text-blue-700 dark:text-blue-300 bg-[var(--zacc-card)]" : "text-[var(--zacc-muted)] hover:text-slate-900 dark:hover:text-slate-100"}`}>
                <span className="text-base mb-1 block">{item.icon}</span>
                {item.label}
                {tab === item.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />}
              </button>
            ))}
          </div>
        )}

        <div className="p-8">
          {error && (
            <div className="mb-6 rounded-2xl border border-rose-300 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-5 py-4 text-rose-700 dark:text-rose-300 text-sm font-medium">
              ⚠️ {error}
            </div>
          )}

          {/* ── STAFF LOGIN ── */}
          {tab === "signin" && (
            <div className="animate-fade-in max-w-md mx-auto">
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-5 py-3 text-xs text-amber-700 dark:text-amber-300 font-semibold">
                {t(language, "staffOnly")}
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-2">{t(language, "emailAddress")}</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="staff@zacc.org.zw" required
                  className={`w-full rounded-2xl border px-5 py-3.5 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition-all font-medium ${portalFieldTone}`} style={portalFieldStyle} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-2">{t(language, "password")}</label>
                <div className="relative">
                  <input type={showStaffPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required
                    className={`w-full rounded-2xl border px-5 py-3.5 pr-14 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition-all font-medium ${portalFieldTone}`} style={portalFieldStyle} />
                  <button type="button" onClick={() => setShowStaffPassword(!showStaffPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-emerald-500 transition-colors p-1" tabIndex={-1}>
                    {showStaffPassword
                      ? <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" /></svg>
                      : <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    }
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading}
                className="w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-black font-bold py-4 disabled:opacity-50 transition-all text-sm uppercase tracking-widest shadow-lg shadow-emerald-500/20">
                {loading ? t(language, "authenticating") : t(language, "signIn")}
              </button>
              <div className="text-center pt-2">
                <button type="button" onClick={() => setTab("report")} className="text-xs font-bold text-slate-400 hover:text-emerald-500 uppercase tracking-widest transition-all">{t(language, "backToPortal")}</button>
              </div>
            </form>
            </div>
          )}

          {/* ── FILE REPORT ── */}
          {tab === "report" && !submitted && (
            <div className="animate-fade-in max-w-2xl mx-auto">
              <form onSubmit={handleAnonymousSubmit} className="space-y-5">
                <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-5 py-3 text-xs text-emerald-800 dark:text-emerald-300 font-semibold">
                  {t(language, "identityProtected")}
                </div>
                {/* <div className="grid grid-cols-1 gap-5">
                  <div>
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-2">{t(language, "corruptionType")}</label>
                    <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}
                      className={`w-full rounded-2xl border px-5 py-3.5 focus:outline-none focus:border-emerald-500 font-medium ${portalFieldTone}`} style={portalFieldStyle}>
                      <option>Bribery</option><option>Procurement Fraud</option><option>Abuse of Office</option>
                      <option>Embezzlement</option><option>Nepotism</option><option>Other</option>
                    </select>
                  </div>
                </div> */}
                
                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-2">{t(language, "affectedInstitution")}</label>
                  <input type="text" value={formData.institution} onChange={e => setFormData({ ...formData, institution: e.target.value })}
                    placeholder={t(language, "institutionPlaceholder")} required
                    className={`w-full rounded-2xl border px-5 py-3.5 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 font-medium ${portalFieldTone}`} style={portalFieldStyle} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-2">Province</label>
                    <select value={portalProvince} onChange={e => handlePortalProvinceChange(e.target.value)}
                      className={`w-full rounded-2xl border px-5 py-3.5 focus:outline-none focus:border-emerald-500 font-medium ${portalFieldTone}`} style={portalFieldStyle}>
                      <option value="">All Provinces</option>
                      {PORTAL_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="relative">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-2">{t(language, "location")}</label>
                    <input type="text" value={formData.location} onChange={e => handleLocationInput(e.target.value)}
                      onFocus={() => { if (formData.location.length >= 1 && locationSuggestions.length > 0) setShowLocationDropdown(true); }}
                      onBlur={() => setTimeout(() => setShowLocationDropdown(false), 200)}
                      placeholder={t(language, "locationPlaceholder")}
                      className={`w-full rounded-2xl border px-5 py-3.5 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 font-medium ${portalFieldTone}`} style={portalFieldStyle} />
                    {showLocationDropdown && locationSuggestions.length > 0 && (
                      <div className="absolute z-30 left-0 right-0 top-full mt-1 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0c1020] shadow-xl max-h-52 overflow-y-auto">
                        {locationSuggestions.map(loc => (
                          <button key={loc} type="button" onClick={() => selectPortalLocation(loc)}
                            className="w-full text-left px-5 py-3 text-sm text-slate-900 dark:text-white hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors font-medium border-b border-slate-100 dark:border-white/5 last:border-0">
                            <span className="mr-2 text-emerald-500">📍</span>{loc}
                        </button>
                      ))}
                    </div>
                  )}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-2">{t(language, "detailedDescription")}</label>
                  <textarea rows={5} value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })}
                    placeholder={t(language, "descriptionPlaceholder")} required
                    className={`w-full rounded-2xl border px-5 py-3.5 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 font-medium resize-none ${portalFieldTone}`} style={portalFieldStyle} />
                  <p className="text-xs text-slate-500 mt-1">{formData.description.length} {t(language, "characters")} ({t(language, "minChars")})</p>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-2">
                    {t(language, "evidenceOptional")}
                  </label>
                  <div
                    onClick={() => reportFileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 dark:border-white/20 rounded-2xl p-4 text-center cursor-pointer hover:border-emerald-400 dark:hover:border-emerald-500/50 transition-all"
                  >
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t(language, "clickToAttach")}</p>
                    <p className="text-xs text-slate-500 mt-1">{t(language, "evidenceHint")}</p>
                  </div>
                  <input
                    ref={reportFileInputRef}
                    type="file"
                    multiple
                    accept={ACCEPTED_MIME}
                    onChange={handleReportFileChange}
                    className="hidden"
                  />

                  {reportFileError && (
                    <p className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-300">⚠️ {reportFileError}</p>
                  )}

                  {reportFiles.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {reportFiles.map((f, i) => (
                        <div key={`${f.name}-${i}`} className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-white/10 px-3 py-2 bg-slate-50 dark:bg-white/5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm">📎</span>
                            <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{f.name}</span>
                            <span className="text-xs text-slate-500">{formatBytes(f.size)}</span>
                          </div>
                          <button type="button" onClick={() => removeReportFile(i)} className="text-rose-500 text-sm font-bold">Remove</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Pre-Submission AI Suggestions */}
                {formData.description.trim().length >= 20 && (
                  <div className="space-y-3">
                    
                    {portalPreSuggestions && (
                      <div className="rounded-2xl border border-violet-200 dark:border-violet-500/20 bg-violet-50 dark:bg-violet-500/5 p-5 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-black text-violet-700 dark:text-violet-400 uppercase tracking-widest">{t(language, "aiAssessment") || "AI Case Assessment"}</p>
                          <button type="button" onClick={() => setPortalPreSuggestions(null)} className="text-violet-400 hover:text-violet-600 text-sm font-bold">&times;</button>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                            portalPreSuggestions.case_strength === "STRONG" ? "bg-emerald-500/10 text-emerald-600 border-emerald-200 dark:border-emerald-500/20" :
                            portalPreSuggestions.case_strength === "MODERATE" ? "bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-500/20" :
                            "bg-rose-500/10 text-rose-600 border-rose-200 dark:border-rose-500/20"
                          }`}>{portalPreSuggestions.case_strength?.replace(/_/g, " ")}</span>
                          <span className="text-xs font-bold text-slate-500">Score: {portalPreSuggestions.strength_score}/100</span>
                          {portalPreSuggestions.ready_to_submit && <span className="text-xs font-bold text-emerald-600">✓ {t(language, "readyToSubmit") || "Ready to submit"}</span>}
                        </div>
                        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{portalPreSuggestions.summary}</p>
                        {portalPreSuggestions.suggestions?.length > 0 && (
                          <div>
                            <p className="text-[10px] font-black text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-1">{t(language, "suggestions") || "Suggestions"}</p>
                            <ul className="space-y-1">
                              {portalPreSuggestions.suggestions.map((s: string, i: number) => (
                                <li key={i} className="text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2"><span className="text-violet-500 mt-0.5">→</span> {s}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {portalPreSuggestions.recommended_evidence?.length > 0 && (
                          <div>
                            <p className="text-[10px] font-black text-cyan-600 dark:text-cyan-400 uppercase tracking-wider mb-1">{t(language, "recommendedEvidence") || "Recommended Evidence"}</p>
                            <ul className="space-y-1">
                              {portalPreSuggestions.recommended_evidence.map((e: string, i: number) => (
                                <li key={i} className="text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2"><span className="text-cyan-500 mt-0.5">📎</span> {e}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {portalPreSuggestions.missing_details?.length > 0 && (
                          <div>
                            <p className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1">{t(language, "missingDetails") || "Missing Details"}</p>
                            <ul className="space-y-1">
                              {portalPreSuggestions.missing_details.map((d: string, i: number) => (
                                <li key={i} className="text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2"><span className="text-amber-500 mt-0.5">!</span> {d}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <button type="submit" disabled={loading}
                  className="w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-black font-bold py-4 disabled:opacity-50 transition-all text-sm uppercase tracking-widest shadow-lg shadow-emerald-500/20">
                  {loading ? t(language, "submittingSecurely") : t(language, "submitAnonymousReport")}
                </button>
              </form>
            </div>
          )}

          {tab === "report" && submitted && (
            <div className="animate-fade-in max-w-2xl mx-auto">
              <div className="space-y-5">
              <div className="rounded-3xl border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white text-2xl flex items-center justify-center font-black flex-shrink-0">✓</div>
                  <div className="flex-1">
                    <p className="font-black text-emerald-700 dark:text-emerald-300 text-lg mb-2">{t(language, "reportSubmitted")}</p>
                    <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-4">{t(language, "reportEncrypted")}</p>
                    <div className="bg-white dark:bg-black/30 rounded-2xl p-5 mb-4 border border-emerald-200 dark:border-emerald-500/20">
                      <p className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">{t(language, "sessionTrackingCode")}</p>
                      <div className="flex items-center gap-3">
                        <p className="font-mono font-black text-emerald-700 dark:text-emerald-300 text-2xl tracking-widest flex-1">{submitted.reference_code}</p>
                        <button
                          onClick={() => {
                            try {
                              const el = document.createElement("textarea");
                              el.value = submitted.reference_code;
                              el.style.position = "fixed";
                              el.style.opacity = "0";
                              document.body.appendChild(el);
                              el.select();
                              document.execCommand("copy");
                              document.body.removeChild(el);
                            } catch (_) {}
                            navigator.clipboard?.writeText(submitted.reference_code).catch(() => {});
                            setCopied(true);
                            toast.success("Copied to clipboard!");
                            setTimeout(() => setCopied(false), 2000);
                          }}
                          className={`flex-shrink-0 px-4 py-2 rounded-xl text-white text-xs font-black uppercase tracking-wider transition-all ${
                            copied ? "bg-emerald-700" : "bg-emerald-500 hover:bg-emerald-600"
                          }`}
                        >
                          {copied ? "✓ Copied!" : "Copy"}
                        </button>
                      </div>
                    </div>
                    <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-4 py-3 text-xs text-amber-700 dark:text-amber-300 font-semibold">
                      ⚠️ {t(language, "saveCodeWarning")}
                    </div>
                  </div>
                </div>
              </div>
              {reportUploadNotice && (
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  {reportUploadNotice}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="rounded-xl border border-slate-200 dark:border-white/10 p-4 bg-slate-50 dark:bg-white/5">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{t(language, "status")}</p>
                  <p className="font-black text-blue-600 dark:text-blue-400">SUBMITTED</p>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-white/10 p-4 bg-slate-50 dark:bg-white/5">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{t(language, "evidence")}</p>
                  <p className="font-black text-slate-900 dark:text-white">{reportSubmittedEvidenceCount} file{reportSubmittedEvidenceCount === 1 ? "" : "s"}</p>
                </div>
              </div>
              <button onClick={() => { setTab("tracking"); setTrackingCode(submitted.reference_code); setSubmitted(null); }}
                className="w-full rounded-2xl border border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold py-3.5 text-sm uppercase tracking-wider hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-all">
                {t(language, "trackThisCase")}
              </button>
              <button onClick={() => { setSubmitted(null); setReportUploadNotice(null); setReportSubmittedEvidenceCount(0); }}
                className="w-full rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 font-bold py-3 text-sm uppercase tracking-wider hover:bg-slate-200 dark:hover:bg-white/10 transition-all">
                {t(language, "submitAnother")}
              </button>
              </div>
            </div>
          )}

          {/* ── TRACK CASE ── */}
          {tab === "tracking" && (
            <div className="animate-fade-in max-w-6xl mx-auto">
            <div className="space-y-6">
              <form onSubmit={handleTrack} className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-2">{t(language, "enterTrackingCode")}</label>
                  <input type="text" value={trackingCode} onChange={e => setTrackingCode(e.target.value.toUpperCase())}
                    placeholder="ZACC-REF-XXXXXXXXX"
                    className={`w-full rounded-2xl border px-5 py-3.5 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 font-mono font-bold tracking-widest uppercase ${portalFieldTone}`} style={portalFieldStyle} />
                </div>
                <button type="submit" disabled={loading}
                  className="sm:mt-7 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-black font-bold px-6 py-3.5 disabled:opacity-50 transition-all text-sm uppercase tracking-wider whitespace-nowrap shadow-lg shadow-emerald-500/20">
                  {loading ? t(language, "searching") : t(language, "trackCase")}
                </button>
              </form>

              {/* ── TRACKED CASE DASHBOARD ── */}
              {trackedCase && (
                <div className="space-y-6 animate-fade-in">
                  {/* Overview */}
                  <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-gradient-to-br from-slate-50 to-white dark:from-white/5 dark:to-white/2 p-6">
                    <div className="flex items-start justify-between gap-4 mb-5">
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">{t(language, "caseOverview")}</p>
                        <h3 className="text-xl font-black text-slate-900 dark:text-white">{trackedCase.type}</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{trackedCase.institution}</p>
                      </div>
                      <span className={`px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider border ${trackedCase.status === "DISPUTED" ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/20" : trackedCase.status === "CLOSED" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20" : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20"}`}>
                        {statusLabel(trackedCase.status)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {[
                        { label: t(language, "caseId"), value: trackedCase.case_id },
                        { label: t(language, "reference"), value: trackedCase.reference_code },
                      ].map(item => (
                        <div key={item.label} className="rounded-xl bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 p-3">
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{item.label}</p>
                          <p className="font-black text-slate-900 dark:text-white text-sm">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Status Timeline */}
                  <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#080c18] p-5">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">{t(language, "caseProgress")}</p>
                    <div className="flex items-center gap-0">
                      {currentStatusOrder.map((s, i) => {
                        const done = i <= activeStatusIdx && trackedCase.status !== "DISPUTED";
                        const isCurrent = trackedCase.status === "DISPUTED" ? s === "CLOSED" : trackedCase.status === s;
                        return (
                          <React.Fragment key={s}>
                            <div className="flex flex-col items-center flex-1">
                              <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-black ${done ? "bg-emerald-500 border-emerald-500 text-white" : isCurrent ? "border-emerald-500 text-emerald-500 bg-white dark:bg-[#080c18]" : "border-slate-300 dark:border-white/20 text-slate-400"}`}>
                                {done ? "✓" : i + 1}
                              </div>
                              <p className={`text-[9px] font-bold uppercase tracking-wider mt-1.5 text-center leading-tight ${done || isCurrent ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`}>
                                {statusLabel(s)}
                              </p>
                            </div>
                            {i < currentStatusOrder.length - 1 && (
                              <div className={`h-0.5 flex-1 mb-5 ${i < activeStatusIdx ? "bg-emerald-500" : "bg-slate-200 dark:bg-white/10"}`} />
                            )}
                          </React.Fragment>
                        );
                      })}
                      {trackedCase.status === "DISPUTED" && (
                        <>
                          <div className="h-0.5 flex-1 mb-5 bg-rose-400" />
                          <div className="flex flex-col items-center">
                            <div className="w-8 h-8 rounded-full border-2 bg-rose-500 border-rose-500 text-white flex items-center justify-center text-xs font-black">!</div>
                            <p className="text-[9px] font-bold uppercase tracking-wider mt-1.5 text-rose-500 text-center">Disputed</p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {(trackedCase.status === "SUCCESSFUL" || trackedCase.status === "CLOSED") && (
                    <div className="rounded-2xl border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 p-5">
                      <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-widest mb-2">
                        Final Outcome Summary
                      </p>
                      <p className="text-sm text-emerald-800 dark:text-emerald-200 whitespace-pre-wrap leading-relaxed">
                        {finalOutcomeStage?.investigator_notes ||
                          (trackedCase.status === "SUCCESSFUL"
                            ? "This case concluded successfully with corrective or enforcement action."
                            : "This case was closed after final review and assessment of available evidence.")}
                      </p>
                      <p className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80 mt-3">
                        Recorded at: {finalOutcomeStage?.created_at
                          ? new Date(finalOutcomeStage.created_at).toLocaleString()
                          : trackedCase.last_updated
                          ? new Date(trackedCase.last_updated).toLocaleString()
                          : "Date not available"}
                      </p>
                    </div>
                  )}

                  {/* Evidence Upload */}
                  {!["CLOSED", "DISPUTED"].includes(trackedCase.status) && (
                    <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#080c18] p-5">
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{t(language, "addEvidence")}</p>
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                          {trackedCase.attachments_count}/10 {t(language, "filesUploaded")}
                        </span>
                      </div>
                      {evidenceSuccess && (
                        <div className="mb-4 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/20 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300 font-semibold">
                          ✓ {evidenceSuccess}
                        </div>
                      )}
                      {evidenceError && (
                        <div className="mb-4 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-300 dark:border-rose-500/20 px-4 py-3 text-sm text-rose-700 dark:text-rose-300 font-semibold">
                          ⚠️ {evidenceError}
                        </div>
                      )}
                      {maxEvidenceReach > 0 ? (
                        <>
                          <div
                            onClick={() => evidenceInputRef.current?.click()}
                            className="border-2 border-dashed border-slate-300 dark:border-white/20 rounded-2xl p-6 text-center cursor-pointer hover:border-emerald-400 dark:hover:border-emerald-500/50 transition-all group">
                            <p className="text-2xl mb-2">📎</p>
                            <p className="text-sm font-bold text-slate-700 dark:text-slate-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400">{t(language, "clickToAddEvidence")}</p>
                            <p className="text-xs text-slate-500 mt-1">{t(language, "evidenceFileHint")} · {maxEvidenceReach} {t(language, "moreFiles")}</p>
                          </div>
                          <input ref={evidenceInputRef} type="file" multiple accept={ACCEPTED_MIME}
                            onChange={handleEvidenceFileChange} className="hidden" />
                          {evidenceFiles.length > 0 && (
                            <div className="mt-4 space-y-2">
                              {evidenceFiles.map((f, i) => (
                                <div key={i} className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-white/10 px-4 py-2.5 bg-slate-50 dark:bg-white/5">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <span className="text-base">{f.type.startsWith("image/") ? "🖼️" : f.type.startsWith("video/") ? "🎥" : f.type.startsWith("audio/") ? "🎵" : "📄"}</span>
                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{f.name}</span>
                                    <span className="text-xs text-slate-500 flex-shrink-0">{formatBytes(f.size)}</span>
                                  </div>
                                  <button onClick={() => removeEvidenceFile(i)}
                                    className="text-rose-500 hover:text-rose-700 text-lg leading-none ml-3 flex-shrink-0">×</button>
                                </div>
                              ))}
                              <button onClick={handleEvidenceUpload} disabled={evidenceUploading}
                                className="w-full mt-2 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-black font-bold text-sm uppercase tracking-wider disabled:opacity-50 transition-all">
                                {evidenceUploading ? t(language, "uploading") : `${t(language, "upload")} ${evidenceFiles.length}`}
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-sm text-slate-500 text-center py-4">{t(language, "maxEvidenceReached")}</p>
                      )}
                    </div>
                  )}

                  {/* Dispute Section */}
                  {trackedCase.status === "CLOSED" && !disputeSuccess && (
                    <div className="rounded-2xl border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 p-5">
                      <p className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-widest mb-2">{t(language, "caseClosed")}</p>
                      {trackedCase.dispute_reason && (
                        <div className="rounded-xl bg-white dark:bg-black/20 border border-amber-200 dark:border-amber-500/20 px-4 py-3 mb-4">
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{t(language, "closureReason")}</p>
                          <p className="text-sm text-slate-700 dark:text-slate-300">{trackedCase.dispute_reason}</p>
                        </div>
                      )}
                      <p className="text-sm text-amber-700 dark:text-amber-300 mb-4">{t(language, "disputeExplanation")}</p>
                      {!disputeOpen ? (
                        <button onClick={() => setDisputeOpen(true)}
                          className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm uppercase tracking-wider transition-all">
                          {t(language, "disputeThisDecision")}
                        </button>
                      ) : (
                        <div className="space-y-4 animate-fade-in">
                          {disputeError && (
                            <div className="rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-300 dark:border-rose-500/20 px-4 py-3 text-sm text-rose-700 dark:text-rose-300 font-semibold">
                              ⚠️ {disputeError}
                            </div>
                          )}
                          <div>
                            <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-2">{t(language, "disputeStatement")} <span className="text-rose-500">*</span></label>
                            <textarea rows={4} value={disputeReason} onChange={e => setDisputeReason(e.target.value)}
                              placeholder={t(language, "disputePlaceholder")}
                              className={`w-full rounded-xl border px-4 py-3 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 font-medium resize-none ${portalFieldTone}`} style={portalFieldStyle} />
                          </div>
                          <div>
                            <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block mb-2">{t(language, "supportingEvidence")}</label>
                            <div onClick={() => disputeInputRef.current?.click()}
                              className="border-2 border-dashed border-slate-300 dark:border-white/20 rounded-xl p-4 text-center cursor-pointer hover:border-amber-400 transition-all">
                              <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">Click to attach evidence files · Max 10MB each · Up to 10 files</p>
                            </div>
                            <input ref={disputeInputRef} type="file" multiple accept={ACCEPTED_MIME}
                              onChange={handleDisputeFileChange} className="hidden" />
                            {disputeFiles.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {disputeFiles.map((f, i) => (
                                  <div key={i} className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-white/10 px-3 py-2 text-sm">
                                    <span className="text-slate-700 dark:text-slate-300 truncate">{f.name}</span>
                                    <button onClick={() => setDisputeFiles(p => p.filter((_, j) => j !== i))} className="text-rose-500 ml-2 text-xs">Remove</button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-3">
                            <button onClick={handleDisputeSubmit} disabled={disputeSubmitting}
                              className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm uppercase tracking-wider disabled:opacity-50 transition-all">
                              {disputeSubmitting ? t(language, "processing") : t(language, "submitDispute")}
                            </button>
                            <button onClick={() => setDisputeOpen(false)}
                              className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 font-bold text-sm uppercase tracking-wider hover:bg-slate-200 dark:hover:bg-white/10 transition-all">
                              {t(language, "cancel")}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Dispute Success */}
                  {trackedCase.status === "DISPUTED" && (
                    <div className="rounded-2xl border border-rose-200 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/10 p-5">
                      <p className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-widest mb-2">{t(language, "disputeFiled")}</p>
                      <p className="text-sm text-rose-700 dark:text-rose-300">{t(language, "disputeReceived")}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 text-center">
        <p className="text-xs text-slate-500 font-medium uppercase tracking-widest">
          🔒 {t(language, "encryption")}
        </p>
      </div>
    </div>
  );
};
