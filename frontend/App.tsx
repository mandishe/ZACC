import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./components/Dashboard";
import  ReportForm  from "./components/ReportForm";
import { InvestigatorView } from "./components/InvestigatorView";
import { CaseTracking } from "./components/CaseTracking";
import { UserManagement } from "./components/UserManagement";
import { User, UserRole } from "./types";
import { PublicPortal } from "./components/PublicPortal";
import { Language, t } from "./i18n";
import { WhistleblowerDashboard } from "./components/WhistleblowerDashboard";
import { HelpGuide } from "./components/HelpGuide";
import { ReportGeneration } from "./components/ReportGeneration";
import { CorruptionHotspots } from "./components/CorruptionHotspots";
import { AuthorityFindings } from "./components/AuthorityFindings";
import { Toaster } from "react-hot-toast";
import { apiClient } from "./services/api";

type ThemeMode = "system" | "light" | "dark";

export type View =
  | "dashboard"
  | "report"
  | "hub"
  | "chat"
  | "media"
  | "investigator"
  | "tracking"
  | "users"
  | "reports"
  | "hotspots"
  | "authorities";

  

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<View>("dashboard");
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [language, setLanguage] = useState<Language>("en");
  const [newCaseCount, setNewCaseCount] = useState(0);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [themePreviewOpen, setThemePreviewOpen] = useState(false);
  const notificationPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem("nexus_user");
    const savedTheme = (localStorage.getItem("zacc_theme_mode") ||
      "system") as ThemeMode;
    const savedLanguage = (localStorage.getItem("zacc_language") ||
      "en") as Language;

    setThemeMode(savedTheme);
    setLanguage(savedLanguage);

    if (savedUser) {
      const parsed = JSON.parse(savedUser);
      // Whistleblowers no longer use auth sessions — clear any residual saved sessions
      if (parsed.role === UserRole.WHISTLEBLOWER) {
        localStorage.removeItem("nexus_user");
        localStorage.removeItem("nexus_token");
        return;
      }
      setUser(parsed);
      (window as any).__zacc_user_name =
        parsed.name || parsed.email || "Authorized Officer";
      setCurrentView(
        parsed.role === UserRole.INVESTIGATOR || parsed.role === UserRole.ADMIN
          ? "investigator"
          : "dashboard",
      );
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("zacc_theme_mode", themeMode);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const isDark =
      themeMode === "dark" || (themeMode === "system" && media.matches);

    document.documentElement.classList.toggle("dark", isDark);
    document.body.classList.toggle("bg-white", !isDark);
    document.body.classList.toggle("bg-[#04060b]", isDark);
  }, [themeMode]);

  useEffect(() => {
    localStorage.setItem("zacc_language", language);
  }, [language]);

  // Fetch notification count for staff users
  const fetchNotificationCount = useCallback(async () => {
    if (!user || user.role === UserRole.WHISTLEBLOWER) return;
    try {
      const response = await apiClient.getNotifications();
      if (response?.success && Array.isArray(response.data)) {
        setNotifications(response.data);
        const viewedIds: string[] = JSON.parse(
          localStorage.getItem("zacc_viewed_notifications") || "[]",
        );
        const newCases = response.data.filter(
          (n: any) =>
            ["NEW_CASE_SUBMITTED", "ANONYMOUS_REPORT_SUBMITTED"].includes(
              n.type,
            ) && !viewedIds.includes(String(n.id)),
        );
        setNewCaseCount(newCases.length);
      }
    } catch {
      // silent
    }
  }, [user]);

  useEffect(() => {
    fetchNotificationCount();
    const interval = window.setInterval(fetchNotificationCount, 30000);
    return () => window.clearInterval(interval);
  }, [fetchNotificationCount]);

  useEffect(() => {
    if (!notificationsOpen) return;
    const onClickOutside = (event: MouseEvent) => {
      if (
        notificationPanelRef.current &&
        !notificationPanelRef.current.contains(event.target as Node)
      ) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [notificationsOpen]);

  const viewedNotificationIds = useMemo(() => {
    try {
      return JSON.parse(
        localStorage.getItem("zacc_viewed_notifications") || "[]",
      ) as string[];
    } catch {
      return [];
    }
  }, [notifications, notificationsOpen]);

  const unreadNotifications = useMemo(
    () =>
      notifications.filter(
        (n: any) => !viewedNotificationIds.includes(String(n.id)),
      ),
    [notifications, viewedNotificationIds],
  );

  const markNotificationsAsViewed = useCallback(
    (ids?: string[]) => {
      const targetIds = ids ?? notifications.map((n: any) => String(n.id));
      const existing: string[] = JSON.parse(
        localStorage.getItem("zacc_viewed_notifications") || "[]",
      );
      const merged = [...new Set([...existing, ...targetIds])];
      localStorage.setItem("zacc_viewed_notifications", JSON.stringify(merged));

      const unreadNewCases = notifications.filter(
        (n: any) =>
          ["NEW_CASE_SUBMITTED", "ANONYMOUS_REPORT_SUBMITTED"].includes(
            n.type,
          ) && !merged.includes(String(n.id)),
      ).length;

      setNewCaseCount(unreadNewCases);
    },
    [notifications],
  );

  // Mark a single case notification as viewed (called when investigator opens a dossier)
  const markCaseNotificationViewed = useCallback(
    async (caseId: string | number) => {
      try {
        const response = await apiClient.getNotifications();
        if (response?.success && Array.isArray(response.data)) {
          const matchingIds = response.data
            .filter(
              (n: any) =>
                ["NEW_CASE_SUBMITTED", "ANONYMOUS_REPORT_SUBMITTED"].includes(
                  n.type,
                ) &&
                (String(n.report_id) === String(caseId) ||
                  String(n.payload?.case_id) === String(caseId) ||
                  String(n.payload?.reference_code) === String(caseId)),
            )
            .map((n: any) => String(n.id));
          if (matchingIds.length > 0) {
            const existing: string[] = JSON.parse(
              localStorage.getItem("zacc_viewed_notifications") || "[]",
            );
            const merged = [...new Set([...existing, ...matchingIds])];
            localStorage.setItem(
              "zacc_viewed_notifications",
              JSON.stringify(merged),
            );
            setNewCaseCount((prev) => Math.max(0, prev - matchingIds.length));
          }
        }
      } catch {
        // silent
      }
    },
    [],
  );

  const handleLogin = (u: User) => {
    if (u.role === UserRole.WHISTLEBLOWER) return; // blocked at PublicPortal level
    setUser(u);
    (window as any).__zacc_user_name =
      u.name || u.email || "Authorized Officer";
    localStorage.setItem("nexus_user", JSON.stringify(u));
    setCurrentView("investigator");
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem("nexus_user");
    setCurrentView("dashboard");
  };

  if (!user) {
    return (
      <>
        <PublicPortal
          onLogin={handleLogin}
          language={language}
          onLanguageChange={setLanguage}
          themeMode={themeMode}
          onThemeModeChange={setThemeMode}
        />
        <HelpGuide />
      </>
    );
  }

  const renderView = () => {
    switch (currentView) {
      case "dashboard":
        if (user.role === UserRole.WHISTLEBLOWER) {
          return (
            <WhistleblowerDashboard
              user={user}
              language={language}
              onCreateReport={() => setCurrentView("report")}
            />
          );
        }
        return <Dashboard />;
      case "report":
        return (
          <ReportForm
            user={user}
            language={language}
            onSuccess={() => setCurrentView("tracking")}
          />
        );
      case "investigator":
        return (
          <InvestigatorView
            user={user}
            onCaseViewed={markCaseNotificationViewed}
          />
        );
      case "tracking":
        return (
          <CaseTracking
            user={user}
            onCreateReport={() => setCurrentView("report")}
          />
        );
      case "users":
        return <UserManagement />;
      case "reports":
        return <ReportGeneration language={language} />;
      case "hotspots":
        return <CorruptionHotspots />;
      case "authorities":
        return <AuthorityFindings />;
      default:
        return <Dashboard />;
    }
  };

  const getTitle = (view: View) => {
    switch (view) {
      case "dashboard":
        return user.role === UserRole.WHISTLEBLOWER
          ? t(language, "myDashboard")
          : t(language, "systemOverview");
      case "report":
        return t(language, "reportCase");
      case "investigator":
        return t(language, "controlCenter");
      case "tracking":
        return t(language, "myReports");
      case "users":
        return t(language, "userManagement");
      case "reports":
        return t(language, "reportGeneration");
      case "hotspots":
        return t(language, "corruptionHotspots");
      case "authorities":
        return "Authority Findings";
      default:
        return t(language, "appTitle");
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--zacc-bg)] text-[var(--zacc-text)]">
      <Toaster position="top-right" />
      <Sidebar
        user={user}
        currentView={currentView}
        setView={setCurrentView}
        onLogout={handleLogout}
        language={language}
        onLanguageChange={setLanguage}
      />
      {user.role === UserRole.WHISTLEBLOWER && <HelpGuide />}

      <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8 scroll-smooth">
        <div className="max-w-7xl mx-auto">
          <header className="flex flex-col gap-4 mb-6 sm:mb-8">
            <div
              ref={notificationPanelRef}
              className="relative zacc-surface rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  className="w-10 h-10 rounded-xl border border-[var(--zacc-border)] bg-[var(--zacc-card-soft)] text-slate-700 dark:text-slate-200 font-black"
                  aria-label="Menu"
                >
                  ☰
                </button>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight truncate">
                  {getTitle(currentView)}
                </h1>
              </div>

              
                <select
                  value={themeMode}
                  onChange={(e) => setThemeMode(e.target.value as ThemeMode)}
                  className="px-3 py-2 rounded-lg bg-[var(--zacc-card-soft)] border border-[var(--zacc-border)] text-xs font-semibold"
                >
                  <option value="system">{t(language, "system")}</option>
                  <option value="light">{t(language, "light")}</option>
                  <option value="dark">{t(language, "dark")}</option>
                </select>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as Language)}
                  className="px-3 py-2 rounded-lg bg-[var(--zacc-card-soft)] border border-[var(--zacc-border)] text-xs font-semibold"
                >
                  <option value="en">English</option>
                  <option value="sn">Shona</option>
                  <option value="nd">Ndebele</option>
                  <option value="to">Tonga</option>
                </select>
                <div className="text-right">
                  <p className="text-[10px] font-black text-[var(--zacc-muted)] uppercase tracking-widest mb-1">
                    {t(language, "sessionIdentity")}
                  </p>
                  <p className="text-xs font-black text-slate-900 dark:text-white leading-none tracking-widest flex items-center gap-2">
                    {user.nexusKey}
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/25 text-blue-700 dark:text-blue-300 flex items-center justify-center font-black border border-blue-300/50 dark:border-blue-400/30">
                  {user.nexusKey.charAt(0)}
                </div>
        
            </div>
          </header>

          <div
            className="animate-fade-in transition-all duration-500"
            id="content-container"
          >
            {renderView()}
          </div>
        </div>
      </main>

      {themePreviewOpen && (
        <div className="fixed bottom-4 right-4 z-[70] w-[250px] zacc-surface rounded-2xl p-3 sm:p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-black uppercase tracking-wider text-[var(--zacc-muted)]">
              Quick Theme Preview
            </p>
            <button
              type="button"
              onClick={() => setThemePreviewOpen(false)}
              className="w-6 h-6 rounded-md bg-[var(--zacc-card-soft)] border border-[var(--zacc-border)] text-xs"
            >
              ×
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <button
              type="button"
              onClick={() => setThemeMode("light")}
              className={`px-2 py-2 rounded-lg border text-[11px] font-bold ${themeMode === "light" ? "bg-blue-600 text-white border-blue-600" : "bg-[var(--zacc-card-soft)] border-[var(--zacc-border)]"}`}
            >
              Light
            </button>
            <button
              type="button"
              onClick={() => setThemeMode("dark")}
              className={`px-2 py-2 rounded-lg border text-[11px] font-bold ${themeMode === "dark" ? "bg-blue-600 text-white border-blue-600" : "bg-[var(--zacc-card-soft)] border-[var(--zacc-border)]"}`}
            >
              Dark
            </button>
            <button
              type="button"
              onClick={() => setThemeMode("system")}
              className={`px-2 py-2 rounded-lg border text-[11px] font-bold ${themeMode === "system" ? "bg-blue-600 text-white border-blue-600" : "bg-[var(--zacc-card-soft)] border-[var(--zacc-border)]"}`}
            >
              System
            </button>
          </div>
          <button
            type="button"
            onClick={() =>
              setThemeMode((prev) => (prev === "dark" ? "light" : "dark"))
            }
            className="w-full px-2 py-2 rounded-lg bg-blue-500/10 border border-blue-300/40 dark:border-blue-400/30 text-xs font-bold text-blue-700 dark:text-blue-300"
          >
            Flip Light/Dark
          </button>
        </div>
      )}

      <style>{`
        .stealth-blur #content-container {
          filter: blur(25px);
          opacity: 0.2;
          pointer-events: none;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(16, 185, 129, 0.2); border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default App;
