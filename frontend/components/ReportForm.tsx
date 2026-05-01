import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { analyzeCase } from "../services/gemini";
import { apiClient } from "../services/api";
import { CorruptionType, User } from "../types";
import { Language, t } from "../i18n";
import { toast } from "react-hot-toast";
import { ALL_LANGUAGES, PRIORITY_LANGUAGES, getLanguageName } from "../lib/languages";
import { useDropzone } from 'react-dropzone';
import { UploadCloud, File, AlertCircle, CheckCircle, Shield } from 'lucide-react';

// File upload configuration
const MAX_FILES = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "audio/mpeg",
  "audio/wav",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
];

interface ReportFormProps {
  user: User;
  language: Language;
  onSuccess: () => void;
}

// Zimbabwe provinces with their towns/cities mapped
const PROVINCE_LOCATIONS: Record<string, string[]> = {
  "Harare Province": [
    "Harare", "Chitungwiza", "Epworth", "Ruwa", "Norton",
  ],
  "Bulawayo Province": [
    "Bulawayo",
  ],
  "Manicaland": [
    "Mutare", "Rusape", "Chipinge", "Nyanga", "Chimanimani",
    "Buhera", "Murambinda", "Penhalonga", "Headlands",
    "Hauna", "Juliasdale", "Nyazura", "Dorowa", "Odzi",
    "Sakubva", "Dangamvura", "Chipinge Town", "Mount Selinda",
    "Chimanimani Village", "Chisumbanje", "Hot Springs",
  ],
  "Mashonaland Central": [
    "Bindura", "Mount Darwin", "Shamva", "Mvurwi", "Concession",
    "Mazowe", "Rushinga", "Centenary", "Guruve", "Mbire",
    "Muzarabani", "Glendale",
  ],
  "Mashonaland East": [
    "Marondera", "Chivhu", "Macheke", "Goromonzi", "Seke",
    "Murehwa", "Mutoko", "Mudzi", "Nyamapanda",
  ],
  "Mashonaland West": [
    "Chinhoyi", "Kadoma", "Chegutu", "Karoi", "Kariba",
    "Mhangura", "Banket", "Raffingora", "Tengwe", "Zvimba",
    "Chirundu", "Makuti", "Sanyati", "Alaska Mine", "Selous",
  ],
  "Masvingo Province": [
    "Masvingo", "Chiredzi", "Bikita", "Gutu", "Zaka",
    "Jerera", "Chivi", "Mwenezi", "Ngundu", "Rutenga",
    "Triangle", "Hippo Valley", "Morgenster", "Nemamwa",
    "Buffalo Range", "Tokwe", "Mashoko", "Chatsworth",
  ],
  "Matabeleland North": [
    "Hwange", "Victoria Falls", "Lupane", "Nkayi", "Tsholotsho",
    "Inyathi", "Dete", "Kamativi", "Kazungula",
  ],
  "Matabeleland South": [
    "Gwanda", "Beitbridge", "Plumtree", "Filabusi",
    "West Nicholson", "Esigodini",
  ],
  "Midlands": [
    "Gweru", "Kwekwe", "Zvishavane", "Shurugwi", "Redcliff",
    "Gokwe", "Gokwe South", "Gokwe North", "Zhombe", "Silobela",
    "Mvuma", "Lalapanzi", "Mashava", "Mberengwa", "Gokwe Centre",
  ],
};

const PROVINCES = Object.keys(PROVINCE_LOCATIONS);
const ALL_LOCATIONS = PROVINCES.flatMap(p => PROVINCE_LOCATIONS[p].map(t => `${t}, ${p}`));

function getProvinceForLocation(location: string): string | null {
  for (const [province, towns] of Object.entries(PROVINCE_LOCATIONS)) {
    if (towns.some(t => t.toLowerCase() === location.toLowerCase())) return province;
  }
  return null;
}

// Fuzzy location matching: matches if all characters of query appear in order in the location
function fuzzyMatch(query: string, text: string): { match: boolean; score: number } {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  // Exact start match gets best score
  if (t.startsWith(q)) return { match: true, score: 3 };
  // Contains match
  if (t.includes(q)) return { match: true, score: 2 };
  // Fuzzy: all chars of query appear in order
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  if (qi === q.length) return { match: true, score: 1 };
  return { match: false, score: 0 };
}

const fileIcon = (type: string) => {
  if (type.startsWith("image/")) return "🖼️";
  if (type.startsWith("video/")) return "🎬";
  if (type.startsWith("audio/")) return "🎵";
  if (type.includes("pdf")) return "📄";
  return "📎";
};

export default function ReportForm({ language, onSuccess }: ReportFormProps) {
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [formData, setFormData] = useState({
    type: CorruptionType.BRIBERY,
    institution: "",
    location: "",
    description: "",
  });
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [submittedReport, setSubmittedReport] = useState<any>(null);
  const [evidenceUploadNotice, setEvidenceUploadNotice] = useState<string | null>(null);

  // Evidence upload
  const [files, setFiles] = useState<File[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Location type-ahead
  const [locationQuery, setLocationQuery] = useState("");
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [filteredLocations, setFilteredLocations] = useState<string[]>([]);
  const [selectedProvince, setSelectedProvince] = useState("");

  // Language selection & detection
  const [reportLanguage, setReportLanguage] = useState<string>(language === "sn" ? "sn" : language === "nd" ? "nd" : language === "to" ? "to" : "en");
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const [langSearchQuery, setLangSearchQuery] = useState("");
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const langDropdownRef = useRef<HTMLDivElement>(null);

  // Close language dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (langDropdownRef.current && !langDropdownRef.current.contains(e.target as Node)) {
        setShowLangDropdown(false);
      }
    };
    if (showLangDropdown) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showLangDropdown]);

  // Text clarity
  const [clarityResult, setClarityResult] = useState<{
    clarity_score: number;
    is_clear: boolean;
    issues: string[];
    detected_language: string;
  } | null>(null);
  const [clarityChecking, setClarityChecking] = useState(false);
  const clarityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pre-submission suggestions
  const [preSuggestions, setPreSuggestions] = useState<any>(null);
  const [preSuggestionsLoading, setPreSuggestionsLoading] = useState(false);

  // ── Location type-ahead with fuzzy matching ──
  const handleLocationChange = useCallback((value: string) => {
    setLocationQuery(value);
    setFormData((prev) => ({ ...prev, location: value }));

    if (value.trim().length >= 1) {
      // Filter by selected province if one is chosen
      const pool = selectedProvince
        ? PROVINCE_LOCATIONS[selectedProvince].map(t => `${t}, ${selectedProvince}`)
        : ALL_LOCATIONS;
      const results = pool
        .map((loc) => ({ loc, ...fuzzyMatch(value, loc) }))
        .filter((r) => r.match)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map((r) => r.loc);
      setFilteredLocations(results);
      setShowLocationDropdown(results.length > 0);
    } else {
      setFilteredLocations([]);
      setShowLocationDropdown(false);
    }
  }, [selectedProvince]);

  const selectLocation = (loc: string) => {
    setLocationQuery(loc);
    setFormData((prev) => ({ ...prev, location: loc }));
    // Auto-detect province from selection
    const town = loc.split(",")[0].trim();
    const prov = getProvinceForLocation(town);
    if (prov && !selectedProvince) setSelectedProvince(prov);
    setShowLocationDropdown(false);
  };

  const handleProvinceChange = (province: string) => {
    setSelectedProvince(province);
    // Reset location when province changes
    setLocationQuery("");
    setFormData((prev) => ({ ...prev, location: "" }));
    setFilteredLocations([]);
    setShowLocationDropdown(false);
  };

  // ── File handling ──
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    const errors: string[] = [];
    const valid: File[] = [];

    for (const file of selected) {
      if (files.length + valid.length >= MAX_FILES) {
        errors.push(`Maximum ${MAX_FILES} files allowed.`);
        break;
      }
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`"${file.name}" exceeds 10MB limit.`);
        continue;
      }
      if (!ACCEPTED_TYPES.includes(file.type)) {
        errors.push(`"${file.name}" is not a supported file type.`);
        continue;
      }
      valid.push(file);
    }

    setFiles((prev) => [...prev, ...valid]);
    setFileErrors(errors);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Dropzone logic ──
  const onDrop = useCallback((acceptedFiles: File[], fileRejections: any[]) => {
    setError(null);

    // Handle Validation Errors
    if (fileRejections.length > 0) {
      setError("Some files were rejected. Please ensure they are accepted formats and under 10MB.");
      return;
    }

    // Check for max file limit
    if (files.length + acceptedFiles.length > MAX_FILES) {
      setError(`Maximum ${MAX_FILES} files allowed.`);
      return;
    }

    // Append new files to existing ones
    setFiles((prev) => [...prev, ...acceptedFiles]);
  }, [files.length]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif'],
      'video/*': ['.mp4', '.quicktime'],
      'audio/*': ['.mpeg', '.wav', '.mp3'],
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc', '.docx'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/plain': ['.txt'],
    },
    maxSize: MAX_FILE_SIZE,
    maxFiles: MAX_FILES,
  });

  const removeFile = (indexToRemove: number) => {
    setFiles((prev) => prev.filter((_, index) => index !== indexToRemove));
  };

  // ── Language detection & text clarity checking ──
  const filteredLanguages = useMemo(() => {
    if (!langSearchQuery.trim()) return PRIORITY_LANGUAGES;
    const q = langSearchQuery.toLowerCase();
    return ALL_LANGUAGES.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.nativeName.toLowerCase().includes(q) ||
        l.code.toLowerCase() === q
    ).slice(0, 15);
  }, [langSearchQuery]);

  const checkTextClarity = useCallback(async (text: string) => {
    if (text.trim().length < 20) {
      setClarityResult(null);
      return;
    }
    setClarityChecking(true);
    try {
      const resp = await apiClient.validateTextClarity(text, reportLanguage);
      if (resp.success && resp.data) {
        setClarityResult(resp.data);
        // Auto-update the language selector to match what the user is actually writing
        if (resp.data.detected_language && resp.data.detected_language !== reportLanguage) {
          setReportLanguage(resp.data.detected_language);
        }
        if (resp.data.detected_language && resp.data.detected_language !== 'en') {
          setDetectedLanguage(getLanguageName(resp.data.detected_language));
        } else {
          setDetectedLanguage(null);
        }
      }
    } catch {
      // Silently fail — clarity check is optional
    } finally {
      setClarityChecking(false);
    }
  }, [reportLanguage]);

  const handleDescriptionChange = (text: string) => {
    setFormData((prev) => ({ ...prev, description: text }));

    // Debounced clarity check (800ms after user stops typing)
    if (clarityTimerRef.current) clearTimeout(clarityTimerRef.current);
    if (text.trim().length >= 20) {
      clarityTimerRef.current = setTimeout(() => checkTextClarity(text), 800);
    } else {
      setClarityResult(null);
      setDetectedLanguage(null);
    }
  };

  const getPreSubmissionSuggestions = async () => {
    if (formData.description.trim().length < 10) return;
    setPreSuggestionsLoading(true);
    try {
      const resp = await apiClient.preSubmissionSuggestions({
        type: formData.type,
        description: formData.description,
        institution: formData.institution,
        location: formData.location,
      });
      if (resp.success) setPreSuggestions(resp.data);
    } catch {
      // Silently fail - suggestions are optional
    } finally {
      setPreSuggestionsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.description.trim().length < 20) {
      setError("Description must be at least 20 characters.");
      return;
    }

    // Block submission if text is clearly gibberish
    if (clarityResult && !clarityResult.is_clear) {
      setError(
        "Your report description appears unclear or unrecognizable. Please write a clear description of the corruption incident in any language."
      );
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const analysis = await analyzeCase(formData.description);

      const response = await apiClient.createReport({
        type: analysis.category || formData.type,
        institution: formData.institution,
        location: formData.location,
        description: formData.description,
        risk_score: analysis.riskScore || 50,
        report_language: reportLanguage,
      });

      if (response.success) {
        setAiAnalysis(analysis);
        setSubmittedReport(response.data);

        // Upload evidence files if any
        if (files.length > 0 && response.data.reference_code) {
          try {
            await apiClient.uploadEvidence(response.data.reference_code, files);
            setEvidenceUploadNotice(
              `${files.length} evidence file${files.length === 1 ? "" : "s"} uploaded and linked to this case file.`,
            );
          } catch {
            setEvidenceUploadNotice(
              "Report submitted, but evidence upload failed. You can upload files later using your tracking code in Track Case.",
            );
          }
        } else {
          setEvidenceUploadNotice(null);
        }
      } else {
        throw new Error(response.message || "Failed to submit report");
      }

      setLoading(false);
    } catch (err: any) {
      console.error("Error submitting report:", err);
      setError(err.message || "Failed to submit report. Please try again.");
      setLoading(false);
    }
  };

  if (aiAnalysis && submittedReport) {
    return (
      <div className="max-w-3xl mx-auto animate-fade-in">
        <div className="rounded-3xl border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 p-8 md:p-12">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-3xl flex items-center justify-center mx-auto mb-6 text-5xl">
              ✓
            </div>
            <h2 className="text-3xl md:text-4xl font-black text-emerald-900 dark:text-emerald-100 mb-3">
              {t(language, "reportSubmitted")}
            </h2>
            <p className="text-emerald-800 dark:text-emerald-200 max-w-md mx-auto leading-relaxed">
              {t(language, "caseReceived")}
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 p-6 bg-white/30 dark:bg-white/5 rounded-2xl">
            <div>
              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider mb-2">
                {t(language, "category")}
              </p>
              <p className="text-sm font-black text-emerald-900 dark:text-white">
                {submittedReport.type}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider mb-2">
                {t(language, "expertPriority")}
              </p>
              <p
                className={`text-sm font-black uppercase ${submittedReport.priority === "CRITICAL" ? "text-rose-600 dark:text-rose-400" : submittedReport.priority === "HIGH" ? "text-orange-600 dark:text-orange-400" : "text-emerald-600 dark:text-emerald-400"}`}
              >
                {submittedReport.priority}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider mb-2">
                {t(language, "riskScore")}
              </p>
              <p className="text-sm font-black text-emerald-900 dark:text-white">
                {submittedReport.risk_score}%
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider mb-2">
                {t(language, "evidence")}
              </p>
              <p className="text-sm font-black text-emerald-900 dark:text-white">
                {files.length} file{files.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-black/20 rounded-2xl p-6 mb-8 border border-emerald-200 dark:border-emerald-500/20">
            <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-3">
              {t(language, "yourTrackingCode")}
            </p>
            <div className="flex items-center justify-between gap-4">
              <code className="text-xl md:text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono tracking-tight">
                {submittedReport.reference_code}
              </code>
              <button
                onClick={() => {
                  try {
                    const el = document.createElement("textarea");
                    el.value = submittedReport.reference_code;
                    el.style.position = "fixed";
                    el.style.opacity = "0";
                    document.body.appendChild(el);
                    el.select();
                    document.execCommand("copy");
                    document.body.removeChild(el);
                  } catch (_) {}
                  navigator.clipboard?.writeText(submittedReport.reference_code).catch(() => {});
                  setCopied(true);
                  toast.success("Copied to clipboard!");
                  setTimeout(() => setCopied(false), 2000);
                }}
                className={`px-4 py-2 font-bold text-xs rounded-lg transition-all ${
                  copied
                    ? "bg-emerald-700 text-white"
                    : "bg-emerald-500 hover:bg-emerald-600 text-white"
                }`}
              >
                {copied ? "✓ Copied!" : t(language, "copy")}
              </button>
            </div>
          </div>

          {evidenceUploadNotice && (
            <div className="rounded-2xl p-4 mb-8 border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50/70 dark:bg-emerald-500/10">
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                {evidenceUploadNotice}
              </p>
            </div>
          )}

          {submittedReport.type_corrected && (
            <div className="rounded-2xl p-4 mb-8 border border-amber-200 dark:border-amber-500/20 bg-amber-50/80 dark:bg-amber-500/10">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                We auto-corrected the case type from {submittedReport.type_selected || "your selected category"} to {submittedReport.type} based on your description and evidence.
              </p>
            </div>
          )}

          <div className="bg-white/20 dark:bg-white/5 rounded-2xl p-6 mb-8 border border-emerald-200/30 dark:border-white/10">
            <h3 className="font-bold text-emerald-900 dark:text-white mb-4">
              {t(language, "whatHappensNext")}
            </h3>
            <ol className="space-y-3 text-sm text-emerald-800 dark:text-emerald-100">
              <li className="flex gap-3">
                <span className="font-black text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                  1.
                </span>
                <span>
                  {t(language, "step1")}
                </span>
              </li>
              <li className="flex gap-3">
                <span className="font-black text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                  2.
                </span>
                <span>
                  {t(language, "step2")}
                </span>
              </li>
              <li className="flex gap-3">
                <span className="font-black text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                  3.
                </span>
                <span>
                  {t(language, "step3")}
                </span>
              </li>
            </ol>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={() => {
                setAiAnalysis(null);
                setSubmittedReport(null);
                setEvidenceUploadNotice(null);
                setFiles([]);
                setFileErrors([]);
                setLocationQuery("");
                setDetectedLanguage(null);
                setSelectedProvince("");
                setClarityResult(null);
                setFormData({
                  type: CorruptionType.BRIBERY,
                  institution: "",
                  location: "",
                  description: "",
                });
              }}
              className="flex-1 px-6 py-4 rounded-xl bg-white/20 dark:bg-white/5 hover:bg-white/30 dark:hover:bg-white/10 text-emerald-900 dark:text-white font-bold text-sm uppercase tracking-wider transition-all border border-emerald-200 dark:border-white/10"
            >
              {t(language, "fileAnotherReport")}
            </button>
            <button
              onClick={onSuccess}
              className="flex-1 px-6 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm uppercase tracking-wider transition-all"
            >
              {t(language, "viewMyReports")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#080c18] p-8 md:p-10">
        <div className="mb-8">
          <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-3">
            {t(language, "fileAReport")}
          </h2>
          <p className="text-slate-600 dark:text-slate-400 font-medium">
            {t(language, "reportFormHint")}
          </p>
        </div>

        {error && (
          <div className="mb-8 p-5 rounded-2xl border border-rose-300 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/10 animate-fade-in">
            <p className="text-rose-700 dark:text-rose-300 text-sm font-bold flex items-center gap-2">
              <span>⚠️</span>
              <span>{error}</span>
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Category and Institution */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block ml-1">
                {t(language, "corruptionType")}
              </label>
              <select
                className="w-full rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-black/20 px-5 py-3.5 text-slate-900 dark:text-white font-medium focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-400 transition-all"
                value={formData.type}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    type: e.target.value as CorruptionType,
                  })
                }
              >
                {Object.values(CorruptionType).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block ml-1">
                {t(language, "affectedInstitution")}
              </label>
              <input
                type="text"
                placeholder={t(language, "institutionPlaceholder")}
                className="w-full rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-black/20 px-5 py-3.5 text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-600 font-medium focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-400 transition-all"
                value={formData.institution}
                onChange={(e) =>
                  setFormData({ ...formData, institution: e.target.value })
                }
                required
              />
            </div>
          </div>

          {/* Description with language detection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block ml-1">
                {t(language, "detailedDescription")}
              </label>
              <div className="flex items-center gap-2">
                {detectedLanguage && (
                  <span className="px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                    {t(language, "detected")}: {detectedLanguage}
                  </span>
                )}
              </div>
            </div>

            {/* Language Selector */}
            <div className="flex items-center gap-2 relative" ref={langDropdownRef}>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">
                Writing in:
              </span>
              <button
                type="button"
                onClick={() => { setShowLangDropdown(!showLangDropdown); setLangSearchQuery(""); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 text-white border border-emerald-500 shadow-sm hover:bg-emerald-600 transition-all"
              >
                {getLanguageName(reportLanguage)}
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {showLangDropdown && (
                <div className="absolute top-full left-0 mt-1 z-50 w-72 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-xl overflow-hidden">
                  <div className="p-2 border-b border-slate-100 dark:border-slate-700">
                    <input
                      type="text"
                      placeholder="Search languages..."
                      value={langSearchQuery}
                      onChange={(e) => setLangSearchQuery(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-400"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-52 overflow-y-auto">
                    {filteredLanguages.map((lang) => (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => { setReportLanguage(lang.code); setShowLangDropdown(false); setLangSearchQuery(""); }}
                        className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors ${
                          reportLanguage === lang.code ? "bg-emerald-50 dark:bg-emerald-500/10 font-bold text-emerald-700 dark:text-emerald-400" : "text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        <span>{lang.name} <span className="text-slate-400 dark:text-slate-500">({lang.nativeName})</span></span>
                        {lang.region && <span className="text-[10px] text-slate-400 dark:text-slate-500">{lang.region}</span>}
                        {reportLanguage === lang.code && <span className="text-emerald-500">✓</span>}
                      </button>
                    ))}
                    {filteredLanguages.length === 0 && (
                      <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-3">No languages found</p>
                    )}
                  </div>
                </div>
              )}
            </div>
            <textarea
              rows={6}
              placeholder="Describe what happened in detail. Include dates, names of positions/titles (not your own), amounts, and any witnesses or evidence. You can write in any language you are comfortable with..."
              className="w-full rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-black/20 px-5 py-3.5 text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-600 font-medium leading-relaxed focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-400 transition-all resize-none"
              value={formData.description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              required
            />
            <div className="flex items-center justify-between">
              <p
                className={`text-xs font-medium ml-1 ${formData.description.length < 20 ? "text-slate-500 dark:text-slate-600" : "text-emerald-600 dark:text-emerald-400"}`}
              >
                {formData.description.length} {t(language, "characters")} ({t(language, "minChars")})
              </p>
              {formData.description.length >= 20 &&
                formData.description.length < 250 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                    {t(language, "tipMoreDetail")}
                  </p>
                )}
            </div>

            {/* Text Clarity Indicator */}
            {clarityChecking && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                <div className="w-3 h-3 border-2 border-slate-400/30 border-t-slate-500 rounded-full animate-spin" />
                <span className="text-xs text-slate-500">Checking text clarity...</span>
              </div>
            )}
            {clarityResult && !clarityChecking && (
              <div className={`px-4 py-3 rounded-xl border ${
                clarityResult.clarity_score >= 70
                  ? "bg-emerald-50 dark:bg-emerald-500/5 border-emerald-200 dark:border-emerald-500/20"
                  : clarityResult.clarity_score >= 40
                  ? "bg-amber-50 dark:bg-amber-500/5 border-amber-200 dark:border-amber-500/20"
                  : "bg-rose-50 dark:bg-rose-500/5 border-rose-200 dark:border-rose-500/20"
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">
                      {clarityResult.clarity_score >= 70 ? "✅" : clarityResult.clarity_score >= 40 ? "⚠️" : "❌"}
                    </span>
                    <span className={`text-xs font-black uppercase tracking-wider ${
                      clarityResult.clarity_score >= 70
                        ? "text-emerald-700 dark:text-emerald-400"
                        : clarityResult.clarity_score >= 40
                        ? "text-amber-700 dark:text-amber-400"
                        : "text-rose-700 dark:text-rose-400"
                    }`}>
                      {clarityResult.clarity_score >= 70
                        ? "Clear & readable"
                        : clarityResult.clarity_score >= 40
                        ? "Somewhat unclear — consider improving"
                        : "Text not recognized — please rewrite"}
                    </span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    clarityResult.clarity_score >= 70
                      ? "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"
                      : clarityResult.clarity_score >= 40
                      ? "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20"
                      : "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20"
                  }`}>
                    {clarityResult.clarity_score}/100
                  </span>
                </div>
                {clarityResult.issues.length > 0 && clarityResult.clarity_score < 70 && (
                  <ul className="mt-2 space-y-0.5">
                    {clarityResult.issues.slice(0, 3).map((issue, i) => (
                      <li key={i} className="text-[11px] text-slate-600 dark:text-slate-400 flex items-start gap-1.5">
                        <span className="text-slate-400 mt-0.5">•</span>
                        {issue}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Province & Location with type-ahead */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block ml-1">
                Province
              </label>
              <select
                className="w-full rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-black/20 px-5 py-3.5 text-slate-900 dark:text-white font-medium focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-400 transition-all"
                value={selectedProvince}
                onChange={(e) => handleProvinceChange(e.target.value)}
              >
                <option value="">All Provinces</option>
                {PROVINCES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2 relative">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block ml-1">
                {t(language, "locationDistrictProvince")}
              </label>
              <input
                type="text"
                placeholder={t(language, "locationPlaceholder")}
                className="w-full rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-black/20 px-5 py-3.5 text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-600 font-medium focus:outline-none focus:border-emerald-500 dark:focus:border-emerald-400 transition-all"
                value={locationQuery}
                onChange={(e) => handleLocationChange(e.target.value)}
                onFocus={() => {
                  if (locationQuery.length >= 1 && filteredLocations.length > 0)
                    setShowLocationDropdown(true);
                }}
                onBlur={() =>
                  setTimeout(() => setShowLocationDropdown(false), 200)
                }
              />
              {/* Location suggestions dropdown */}
              {showLocationDropdown && filteredLocations.length > 0 && (
                <div className="absolute z-30 left-0 right-0 top-full mt-1 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0c1020] shadow-xl max-h-52 overflow-y-auto">
                  {filteredLocations.map((loc) => (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => selectLocation(loc)}
                      className="w-full text-left px-5 py-3 text-sm text-slate-900 dark:text-white hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors font-medium border-b border-slate-100 dark:border-white/5 last:border-0"
                    >
                      <span className="mr-2 text-emerald-500">📍</span>
                      {loc}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs text-slate-500 ml-1">
                {selectedProvince ? `Showing locations in ${selectedProvince}` : "Select a province or type to search all locations"}
              </p>
            </div>
          </div>

          {/* Evidence Upload */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block ml-1">
              {t(language, "uploadEvidence")}
            </label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 dark:border-white/15 rounded-2xl p-8 text-center cursor-pointer hover:border-emerald-400 dark:hover:border-emerald-500/40 hover:bg-emerald-50/50 dark:hover:bg-emerald-500/5 transition-all"
            >
              <div className="text-3xl mb-2">📎</div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                {t(language, "clickToUpload")}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {t(language, "uploadHintDetailed")}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">
                JPG, PNG, MP4, MOV, MP3, WAV, PDF, DOC, DOCX, XLS, XLSX, TXT
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_TYPES.join(",")}
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* File errors */}
            {fileErrors.length > 0 && (
              <div className="rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 p-3">
                {fileErrors.map((err, i) => (
                  <p
                    key={i}
                    className="text-xs text-rose-600 dark:text-rose-400 font-medium"
                  >
                    {err}
                  </p>
                ))}
              </div>
            )}

            {/* File list */}
            {files.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  {files.length} file{files.length !== 1 ? "s" : ""} selected
                </p>
                {files.map((file, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span>{fileIcon(file.type)}</span>
                      <span className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {file.name}
                      </span>
                      <span className="text-[10px] text-slate-500 flex-shrink-0">
                        {(file.size / 1024 / 1024).toFixed(1)}MB
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-500/10 text-rose-500 flex items-center justify-center text-xs font-black hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-all flex-shrink-0"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Security Info */}
          <div className="p-5 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-2">
            <p className="text-xs text-slate-700 dark:text-slate-400 font-medium flex items-center gap-2">
              <span className="text-lg">🔒</span>
              <span>
                {t(language, "securityNote")}
              </span>
            </p>
            <p className="text-xs text-slate-700 dark:text-slate-400 font-medium flex items-center gap-2">
              <span className="text-lg">🌐</span>
              <span>
                {t(language, "languageNote")}
              </span>
            </p>
          </div>

          {/* Pre-Submission AI Suggestions */}
          {formData.description.trim().length >= 20 && (
            <div className="space-y-3">
              {!preSuggestions && (
                <button type="button" onClick={getPreSubmissionSuggestions} disabled={preSuggestionsLoading}
                  className="w-full py-3 rounded-2xl border-2 border-dashed border-violet-300 dark:border-violet-500/30 text-violet-600 dark:text-violet-400 font-bold text-xs uppercase tracking-widest hover:bg-violet-50 dark:hover:bg-violet-500/5 transition-all disabled:opacity-50">
                  {preSuggestionsLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
                      {t(language, "analyzing") || "Analyzing your report..."}
                    </span>
                  ) : "🤖 Get AI Suggestions Before Submitting"}
                </button>
              )}
              {preSuggestions && (
                <div className="rounded-2xl border border-violet-200 dark:border-violet-500/20 bg-violet-50 dark:bg-violet-500/5 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black text-violet-700 dark:text-violet-400 uppercase tracking-widest">AI Case Assessment</p>
                    <button type="button" onClick={() => setPreSuggestions(null)} className="text-violet-400 hover:text-violet-600 text-sm font-bold">&times;</button>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                      preSuggestions.case_strength === "STRONG" ? "bg-emerald-500/10 text-emerald-600 border-emerald-200 dark:border-emerald-500/20" :
                      preSuggestions.case_strength === "MODERATE" ? "bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-500/20" :
                      "bg-rose-500/10 text-rose-600 border-rose-200 dark:border-rose-500/20"
                    }`}>{preSuggestions.case_strength?.replace(/_/g, " ")}</span>
                    <span className="text-xs font-bold text-slate-500">Score: {preSuggestions.strength_score}/100</span>
                    {preSuggestions.ready_to_submit && <span className="text-xs font-bold text-emerald-600">✓ Ready to submit</span>}
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{preSuggestions.summary}</p>
                  {preSuggestions.suggestions?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-black text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-1">Suggestions</p>
                      <ul className="space-y-1">
                        {preSuggestions.suggestions.map((s: string, i: number) => (
                          <li key={i} className="text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2"><span className="text-violet-500 mt-0.5">→</span> {s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {preSuggestions.recommended_evidence?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-black text-cyan-600 dark:text-cyan-400 uppercase tracking-wider mb-1">Recommended Evidence</p>
                      <ul className="space-y-1">
                        {preSuggestions.recommended_evidence.map((e: string, i: number) => (
                          <li key={i} className="text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2"><span className="text-cyan-500 mt-0.5">📎</span> {e}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {preSuggestions.missing_details?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1">Missing Details</p>
                      <ul className="space-y-1">
                        {preSuggestions.missing_details.map((d: string, i: number) => (
                          <li key={i} className="text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2"><span className="text-amber-500 mt-0.5">!</span> {d}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || formData.description.trim().length < 20 || (clarityResult !== null && !clarityResult.is_clear)}
            className={`w-full rounded-2xl font-bold py-4 text-sm uppercase tracking-widest transition-all ${
              loading || formData.description.trim().length < 20 || (clarityResult !== null && !clarityResult.is_clear)
                ? "bg-slate-300 dark:bg-slate-700 text-slate-600 dark:text-slate-400 cursor-not-allowed"
                : "bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20"
            }`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Processing...
              </span>
            ) : (
              `${t(language, "submitSecureReport")}${files.length > 0 ? ` ${t(language, "withEvidenceFiles")} (${files.length})` : ""}`
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
