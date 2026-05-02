import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./components/Dashboard";
import ReportForm from "./components/ReportForm";
import { CaseTracking } from "./components/CaseTracking";
import { UserManagement } from "./components/UserManagement";
import { User, UserRole } from "./types";
import { PublicPortal } from "./components/PublicPortal";
import { Language, t } from "./i18n";
import { WhistleblowerDashboard } from "./components/WhistleblowerDashboard";
import { HelpGuide } from "./components/HelpGuide";
import { ReportGeneration } from "./components/ReportGeneration";
import { AuthorityFindings } from "./components/AuthorityFindings";
import { Toaster } from "react-hot-toast";
import { apiClient } from "./services/api";
import InvestigatorView from "./components/InvestigatorView";
import CorruptionHotspots from "./components/CorruptionHotspots";
import CaseDetailView from "./components/CaseDetailView"; // ✅ NEW

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

  // ✅ NEW STATE
  const [selectedCaseId, setSelectedCaseId] = useState<
    string | number | null
  >(null);

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
      if (parsed.role === UserRole.WHISTLEBLOWER) {
        localStorage.removeItem("nexus_user");
        localStorage.removeItem("nexus_token");
        return;
      }
      setUser(parsed);
      (window as any).__zacc_user_name =
        parsed.name || parsed.email || "Authorized Officer";
      setCurrentView(
        parsed.role === UserRole.INVESTIGATOR ||
          parsed.role === UserRole.ADMIN
          ? "investigator"
          : "dashboard"
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

  const fetchNotificationCount = useCallback(async () => {
    if (!user || user.role === UserRole.WHISTLEBLOWER) return;
    try {
      const response = await apiClient.getNotifications();
      if (response?.success && Array.isArray(response.data)) {
        setNotifications(response.data);
        const viewedIds: string[] = JSON.parse(
          localStorage.getItem("zacc_viewed_notifications") || "[]"
        );
        const newCases = response.data.filter(
          (n: any) =>
            ["NEW_CASE_SUBMITTED", "ANONYMOUS_REPORT_SUBMITTED"].includes(
              n.type
            ) && !viewedIds.includes(String(n.id))
        );
        setNewCaseCount(newCases.length);
      }
    } catch {}
  }, [user]);

  useEffect(() => {
    fetchNotificationCount();
    const interval = window.setInterval(fetchNotificationCount, 30000);
    return () => window.clearInterval(interval);
  }, [fetchNotificationCount]);

  const markCaseNotificationViewed = useCallback(async (caseId: any) => {
    try {
      await apiClient.getNotifications();
    } catch {}
  }, []);

  const handleLogin = (u: User) => {
    if (u.role === UserRole.WHISTLEBLOWER) return;
    setUser(u);
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

  // ✅ 🔥 CASE DETAIL VIEW OVERRIDE
  if (selectedCaseId) {
    return (
      <CaseDetailView
        caseId={selectedCaseId}
        onBack={() => setSelectedCaseId(null)}
      />
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
            onCaseViewed={(caseId: any) => {
              markCaseNotificationViewed(caseId);
              setSelectedCaseId(caseId); // ✅ OPEN CASE
            }}
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

      <main className="flex-1 overflow-y-auto p-6">
        <h1 className="text-2xl font-bold mb-4">
          {getTitle(currentView)}
        </h1>

        {renderView()}
      </main>
    </div>
  );
};

export default App;