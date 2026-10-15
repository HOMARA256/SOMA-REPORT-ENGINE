import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
} from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "./config/supabaseClient";

import { AppShell } from "./components/layout/AppShell";
import { AcademicSetupPage } from "./features/academicSetup/AcademicSetupPage";
import { AcademicSetupHealthPage } from "./features/academicSetup/AcademicSetupHealthPage";
import { ApprovalsPage } from "./features/approvals/ApprovalsPage";
import { ApprovalDelegationsPage } from "./features/approvals/ApprovalDelegationsPage";
import { AcademicWorkspaceProvider } from "./features/academicSetup/AcademicWorkspace";
import { OLevelWorkspace } from "./features/academicSetup/OLevelWorkspace";
import { AssessmentsPage } from "./features/assessments/AssessmentsPage";
import { ClassManagementPage } from "./features/classes/ClassManagementPage";
import { ClassDetailPage } from "./features/classes/ClassDetailPage";
import { ClassFormPage } from "./features/classes/ClassFormPage";
import { LearnerSubjectsPage } from "./features/learners/LearnerSubjectsPage";
import { MarksEntryPage } from "./features/marks/MarksEntryPage";
import { ALevelMarksEntryPage } from "./features/marks/ALevelMarksEntryPage";
import { MarksheetPage } from "./features/marks/MarksheetPage";
import { ResultsAnalysisPage } from "./features/results/ResultsAnalysisPage";
import { ReportCardsPage } from "./features/reports/ReportCardsPage";
import { ReportArchivePage } from "./features/reports/ReportArchivePage";
import { MissingMarksPage } from "./features/marks/MissingMarksPage";
import { ModerationPage } from "./features/marks/ModerationPage";
import { LoginPage } from "./features/auth/LoginPage";
import { ResetPasswordPage } from "./features/auth/ResetPasswordPage";
import { ActivateSchoolPage } from "./features/auth/ActivateSchoolPage";
import { TeacherInvitationAcceptPage } from "./features/auth/TeacherInvitationAcceptPage";
import { Dashboard } from "./features/dashboard/Dashboard";
import AddLearnerPage from "./features/learners/AddLearnerPage";
import EditLearnerPage from "./features/learners/EditLearnerPage";
import LearnerProfilePage from "./features/learners/LearnerProfilePage";
import PersistentLearnerProfilePage from "./features/learners/PersistentLearnerProfilePage";
import { GuardianLearnersPage } from "./features/learners/GuardianLearnersPage";
import LearnersPage from "./features/learners/LearnersPage";
import { CycleCompletionPage } from "./features/learners/CycleCompletionPage";
import { S5AdmissionPage } from "./features/learners/S5AdmissionPage";
import { StaffUsersPage } from "./features/staff/staffUsersPage";
import { TeacherAllocationsPage } from "./features/staff/TeacherAllocationsPage";
import { TeacherProfilePage } from "./features/staff/TeacherProfilePage";
import { SchoolSubjectSettingsPage } from "./features/subjects/SchoolSubjectSettingsPage";
import { SubjectDetailPage } from "./features/subjects/SubjectDetailPage";
import { UserProfilePage } from "./features/profile/UserProfilePage";
import { AuditPage } from "./features/audit/AuditPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { SchoolProfilePage } from "./features/settings/SchoolProfilePage";
import { ReportHeaderSettingsPage } from "./features/settings/ReportHeaderSettingsPage";
import { ALevelGradingSettingsPage } from "./features/settings/ALevelGradingSettingsPage";
import { ALevelCombinationsPage, ALevelDashboardPage } from "./features/alevel/ALevelDashboardPage";
import { ALevelCombinationFormPage } from "./features/alevel/ALevelCombinationFormPage";
import { SchoolSettingsProvider } from "./features/settings/SchoolSettingsWorkspace";
import { ImportExportPage } from "./features/importExport/ImportExportPage";
import { ImportExportSettingsPage } from "./features/importExport/ImportExportSettingsPage";
import { ImportExportWorkspaceProvider } from "./features/importExport/ImportExportWorkspace";
import { PlatformWorkspaceProvider } from "./features/platform/PlatformWorkspace";
import { PlatformAdminGuard, PlatformShell } from "./features/platform/PlatformShell";
import { PlatformLoginPage } from "./features/platform/PlatformLoginPage";
import { PlatformLocationCataloguePage } from "./features/platform/PlatformLocationCataloguePage";
import { PlatformDashboardPage, PlatformGlobalModulePage, PlatformSchoolControlPage, PlatformSchoolsPage, RegisterSchoolPage } from "./features/platform/PlatformPages";
import { PlatformPaymentSettingsPage, ProductionSchoolSubscriptionPage, SchoolReceiptsPage } from "./features/platform/ProductionBillingPages";
import { MessageCentrePage, PlatformNotificationCenterPage, SchoolNotificationCenterPage } from "./features/notifications/NotificationCenterPages";
import { resolveCurrentIdentity } from "./features/auth/authSession";
import { applyResolvedIdentity } from "./config/currentUser";
import { SchoolContextProvider } from "./features/context/SchoolContext";
import { AdmissionsManagementPage, PublicAdmissionsPage } from "./features/admissions/AdmissionsPage";
import { DocumentLibraryPage, IdentityCardsPage, PublicIdVerificationPage } from "./features/admissions/IdentityDocumentsPages";
import { SystemDialogsProvider } from "./components/system/SystemDialogs";

/** Adds contextual column labels so CSS can reflow ordinary tables as record cards. */
function ResponsiveTableLabels() {
  useEffect(() => {
    const labelTables = () => {
      document.querySelectorAll<HTMLTableElement>(".table-wrapper > table").forEach((table) => {
        const headings = Array.from(table.tHead?.rows[0]?.cells ?? [], (cell) => {
          const text = cell.textContent?.replace(/\s+/g, " ").trim() ?? "";
          return text || (cell.querySelector("button,a") ? "Actions" : "Details");
        });
        Array.from(table.tBodies).forEach((body) => Array.from(body.rows).forEach((row) => Array.from(row.cells).forEach((cell) => {
          if (cell.colSpan > 1) return;
          const label = headings[cell.cellIndex];
          if (label && cell.dataset.label !== label) cell.dataset.label = label;
        })));
      });
      document.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
        if (button.querySelector("svg") && !button.textContent?.trim()) {
          const accessibleName = button.getAttribute("aria-label") || button.getAttribute("title");
          if (accessibleName && !button.title) button.title = accessibleName;
          if (!button.getAttribute("aria-label") && accessibleName) button.setAttribute("aria-label", accessibleName);
        }
      });
    };
    labelTables();
    const observer = new MutationObserver(labelTables);
    observer.observe(document.getElementById("root") ?? document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}

function ProtectedLayout() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    async function verify() {
      if (!supabase) return active && setAuthorized(false);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return active && setAuthorized(false);
      const resolved=await resolveCurrentIdentity();
      if(resolved.user&&resolved.user.role!=="PLATFORM_ADMIN")applyResolvedIdentity(resolved.user);
      if (active) setAuthorized(Boolean(resolved.user&&resolved.user.role!=="PLATFORM_ADMIN"&&resolved.user.schoolId));
    }
    void verify();
    const { data: listener } = supabase?.auth.onAuthStateChange(() => void verify()) ?? { data: { subscription: null } };
    return () => { active = false; listener.subscription?.unsubscribe(); };
  }, []);
  if (authorized === null) return <main className="auth-checking" aria-live="polite">Verifying secure session…</main>;
  if (!authorized) return <Navigate to="/login" replace />;
  return (
    <SchoolContextProvider><SchoolSettingsProvider><AcademicWorkspaceProvider><AppShell>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/admissions/:section?" element={<AdmissionsManagementPage />} />
        <Route path="/id-cards" element={<IdentityCardsPage />} />
        <Route path="/documents" element={<DocumentLibraryPage />} />
        <Route path="/learners" element={<LearnersPage />} />
        <Route path="/guardian/learners" element={<GuardianLearnersPage />} />
        <Route path="/progression" element={<CycleCompletionPage />} />
        <Route path="/learners/new" element={<AddLearnerPage />} />
        <Route path="/learners/:learnerId/subjects" element={<LearnerSubjectsPage />} />
        <Route path="/learners/:learnerId/admit-a-level" element={<S5AdmissionPage />} />
        <Route path="/learners/:learnerId/edit" element={<EditLearnerPage />} />
        <Route path="/learners/:learnerId" element={<PersistentLearnerProfilePage />} />
        <Route path="/staff" element={<StaffUsersPage />} />
        <Route path="/staff/:userId" element={<TeacherProfilePage />} />
        <Route path="/school/alevel" element={<ALevelDashboardPage />} />
        <Route path="/school/alevel/classes/new" element={<ClassFormPage />} />
        <Route path="/school/alevel/classes/:classId" element={<ClassDetailPage />} />
        <Route path="/school/alevel/classes/:classId/edit" element={<ClassFormPage />} />
        <Route path="/school/alevel/combinations" element={<ALevelCombinationsPage />} />
        <Route path="/school/alevel/combinations/new" element={<ALevelCombinationFormPage />} />
        <Route path="/school/o-level" element={<OLevelWorkspace />}>
          <Route index element={<></>} />
          <Route path="classes" element={<ClassManagementPage />} />
          <Route path="classes/new" element={<ClassFormPage />} />
          <Route path="classes/:classId" element={<ClassDetailPage />} />
          <Route path="classes/:classId/edit" element={<ClassFormPage />} />
          <Route path="subjects" element={<SchoolSubjectSettingsPage />} />
          <Route path="subjects/:subjectId" element={<SubjectDetailPage />} />
          <Route path="learners" element={<LearnersPage />} />
          <Route path="learners/new" element={<AddLearnerPage />} />
          <Route path="learners/:learnerId/subjects" element={<LearnerSubjectsPage />} />
          <Route path="learners/:learnerId" element={<LearnerProfilePage />} />
          <Route path="teachers" element={<TeacherAllocationsPage />} />
          <Route path="assessments" element={<AssessmentsPage />} />
          <Route path="marks" element={<MarksEntryPage />} />
          <Route path="marks/missing" element={<MissingMarksPage />} />
          <Route path="marks/moderation" element={<ModerationPage />} />
          <Route path="approvals" element={<ApprovalsPage />} />
          <Route path="results" element={<ResultsAnalysisPage />} />
          <Route path="reports" element={<ReportCardsPage />} />
          <Route path="reports/archive" element={<ReportArchivePage />} />
        </Route>

        <Route path="/school/learners" element={<LearnersPage />} />
        <Route path="/school/learners/new" element={<AddLearnerPage />} />
        <Route path="/school/learners/:learnerId/subjects" element={<LearnerSubjectsPage />} />
        <Route path="/school/learners/:learnerId" element={<LearnerProfilePage />} />
        <Route path="/school/learners/:learnerId/edit" element={<EditLearnerPage />} />
        <Route path="/people/learners" element={<Navigate to="/school/learners" replace />} />
        <Route path="/people/learners/new" element={<Navigate to="/school/learners/new" replace />} />
        <Route path="/people/learners/:learnerId" element={<LearnerProfilePage />} />
        <Route path="/people/learners/:learnerId/edit" element={<EditLearnerPage />} />

        <Route path="/people/users" element={<StaffUsersPage />} />
        <Route path="/people/users/:userId" element={<TeacherProfilePage />} />

        <Route path="/setup/academic-years" element={<AcademicSetupPage />} />
        <Route path="/setup/classes" element={<ClassManagementPage />} />
        <Route path="/setup/classes/new" element={<ClassFormPage />} />
        <Route path="/setup/classes/:classId" element={<ClassDetailPage />} />
        <Route path="/setup/classes/:classId/edit" element={<ClassFormPage />} />
        <Route path="/setup/health" element={<AcademicSetupHealthPage />} />
        <Route path="/setup/teacher-allocations" element={<TeacherAllocationsPage />} />
        <Route path="/setup/subjects" element={<SchoolSubjectSettingsPage />} />
        <Route path="/setup/subjects/:subjectId" element={<SubjectDetailPage />} />
        <Route path="/setup/assessments" element={<AssessmentsPage />} />

        <Route path="/marks/entry" element={<MarksEntryPage />} />
        <Route path="/marks/a-level-entry" element={<ALevelMarksEntryPage />} />
        <Route path="/marks/marksheet" element={<MarksheetPage />} />
        <Route path="/marks/missing" element={<MissingMarksPage />} />
        <Route path="/marks/moderation" element={<ModerationPage />} />

        <Route path="/results/analysis" element={<ResultsAnalysisPage />} />
        <Route path="/results/approvals" element={<ApprovalsPage />} />
        <Route path="/reports/cards" element={<ReportCardsPage />} />
        <Route path="/reports/archive" element={<ReportArchivePage />} />

        <Route path="/imports" element={<ImportExportPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/approval-delegations" element={<ApprovalDelegationsPage />} />
        <Route path="/settings/school-profile" element={<SchoolProfilePage />} />
        <Route path="/settings/report-card/header" element={<ReportHeaderSettingsPage />} />
        <Route path="/settings/import-export" element={<ImportExportSettingsPage />} />
        <Route path="/settings/academics/a-level/grading" element={<ALevelGradingSettingsPage />} />
        <Route path="/profile" element={<UserProfilePage />} />
        <Route path="/subscription" element={<ProductionSchoolSubscriptionPage />} />
        <Route path="/subscription/receipts" element={<SchoolReceiptsPage />} />
        <Route path="/notifications" element={<SchoolNotificationCenterPage />} />
        <Route path="/messages" element={<MessageCentrePage />} />

        <Route path="/school" element={<Navigate to="/dashboard" replace />} />
        <Route path="/school/settings" element={<Navigate to="/settings" replace />} />
        <Route path="/school/subjects" element={<Navigate to="/setup/subjects" replace />} />
        <Route path="/school/fees" element={<Navigate to="/subscription" replace />} />
        <Route path="/school/reports" element={<Navigate to="/reports/cards" replace />} />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppShell></AcademicWorkspaceProvider></SchoolSettingsProvider></SchoolContextProvider>
  );
}

function PlatformLayout() {
  return <PlatformAdminGuard><PlatformShell><Outlet/></PlatformShell></PlatformAdminGuard>;
}

export default function App() {
  return (
    <ImportExportWorkspaceProvider><PlatformWorkspaceProvider><BrowserRouter><SystemDialogsProvider>
      <ResponsiveTableLabels />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset-password/:portal" element={<ResetPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/activate-school" element={<ActivateSchoolPage />} />
        <Route path="/teacher-invitation/accept" element={<TeacherInvitationAcceptPage />} />
        <Route path="/apply/:schoolCode" element={<PublicAdmissionsPage />} />
        <Route path="/verify/id/:token" element={<PublicIdVerificationPage />} />
        <Route path="/platform/login" element={<PlatformLoginPage/>}/>
        <Route path="/platform-admin" element={<Navigate to="/platform/dashboard" replace/>}/>
        <Route path="/platform" element={<PlatformLayout/>}>
          <Route index element={<Navigate to="/platform/dashboard" replace/>}/>
          <Route path="dashboard" element={<PlatformDashboardPage/>}/>
          <Route path="schools" element={<PlatformSchoolsPage/>}/>
          <Route path="schools/new" element={<RegisterSchoolPage/>}/>
          <Route path="schools/:schoolId/*" element={<PlatformSchoolControlPage/>}/>
          <Route path="subscriptions" element={<PlatformGlobalModulePage module="subscriptions"/>}/>
          <Route path="subscriptions/plans" element={<PlatformGlobalModulePage module="subscriptions"/>}/>
          <Route path="payments" element={<PlatformGlobalModulePage module="payments"/>}/>
          <Route path="catalogue/subjects" element={<PlatformGlobalModulePage module="catalogue"/>}/>
          <Route path="catalogue/curricula" element={<PlatformGlobalModulePage module="catalogue"/>}/>
          <Route path="catalogue/reference-data" element={<PlatformGlobalModulePage module="catalogue"/>}/>
          <Route path="catalogue/locations" element={<PlatformLocationCataloguePage/>}/>
          <Route path="system/health" element={<PlatformGlobalModulePage module="health"/>}/>
          <Route path="system/backups" element={<PlatformGlobalModulePage module="backups"/>}/>
          <Route path="system/*" element={<PlatformGlobalModulePage module="health"/>}/>
          <Route path="security" element={<PlatformGlobalModulePage module="security"/>}/>
          <Route path="audit" element={<PlatformGlobalModulePage module="audit"/>}/>
          <Route path="settings" element={<PlatformGlobalModulePage module="settings"/>}/>
          <Route path="settings/payments" element={<PlatformPaymentSettingsPage/>}/>
          <Route path="notifications" element={<PlatformNotificationCenterPage/>}/>
          <Route path="messages" element={<MessageCentrePage platform/>}/>
          <Route path="account" element={<PlatformGlobalModulePage module="account"/>}/>
          <Route path="*" element={<Navigate to="/platform/dashboard" replace/>}/>
        </Route>
        <Route path="/*" element={<ProtectedLayout />} />
      </Routes>
    </SystemDialogsProvider></BrowserRouter></PlatformWorkspaceProvider></ImportExportWorkspaceProvider>
  );
}
