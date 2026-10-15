import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import { currentUser } from "../../config/currentUser";

export type ImportKind = "MARKS" | "LEARNERS" | "STAFF" | "TEACHER_ALLOCATIONS" | "ACADEMIC_DATA" | "COMPETENCIES" | "MEDIA";
export type ImportStatus = "VALIDATING" | "READY" | "IMPORTING" | "COMPLETED" | "COMPLETED_WITH_WARNINGS" | "FAILED" | "CANCELLED";

export type ImportJob = {
  id: string;
  type: ImportKind;
  fileName: string;
  user: string;
  context: string;
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  createdRows: number;
  updatedRows: number;
  unchangedRows: number;
  status: ImportStatus;
  templateId: string;
  templateVersion: string;
  createdAt: string;
};

export type ExportJob = {
  id: string;
  type: string;
  format: "XLSX" | "CSV" | "PDF";
  context: string;
  recordCount: number;
  requestedBy: string;
  createdAt: string;
};

export type ImportExportSettings = {
  marks: boolean;
  learners: boolean;
  staff: boolean;
  allocations: boolean;
  academic: boolean;
  competencies: boolean;
  media: boolean;
  allowDecimalMarks: boolean;
  allowCsvExports: boolean;
  bulkLearnerPhotos: boolean;
  dateFormat: "DD/MM/YYYY" | "YYYY-MM-DD";
  requireWarningAcknowledgement: boolean;
  sourceFileRetentionDays: number;
};

export type ExchangePolicy = {
  operation: "LEARNERS_IMPORT" | "STAFF_IMPORT" | "TEACHER_ALLOCATIONS_IMPORT" | "MARKS_IMPORT" | "LEARNERS_EXPORT" | "STAFF_EXPORT" | "MARKS_EXPORT" | "RESULTS_EXPORT" | "CONTROLLED_TEMPLATE_DOWNLOAD";
  label: string; direction: "IMPORT" | "EXPORT" | "TEMPLATE"; platformAllowed: boolean; subscriptionAllowed: boolean;
  schoolEnabled: boolean; approvalRequired: boolean; allowedRoles: string[]; scope: "OWN" | "ASSIGNMENT" | "CLASS" | "DEPARTMENT" | "SCHOOL"; limit: number | null;
};

const recommendedSettings: ImportExportSettings = {
  marks: true, learners: true, staff: true, allocations: true, academic: true, competencies: true, media: true,
  allowDecimalMarks: true, allowCsvExports: true, bulkLearnerPhotos: true, dateFormat: "YYYY-MM-DD",
  requireWarningAcknowledgement: true, sourceFileRetentionDays: 30,
};

const defaultPolicies: ExchangePolicy[] = [
  { operation: "LEARNERS_IMPORT", label: "Learner import", direction: "IMPORT", platformAllowed: true, subscriptionAllowed: true, schoolEnabled: true, approvalRequired: false, allowedRoles: ["SCHOOL_ADMIN", "DIRECTOR_OF_STUDIES"], scope: "SCHOOL", limit: 1000 },
  { operation: "STAFF_IMPORT", label: "Staff import", direction: "IMPORT", platformAllowed: true, subscriptionAllowed: true, schoolEnabled: true, approvalRequired: false, allowedRoles: ["SCHOOL_ADMIN"], scope: "SCHOOL", limit: 500 },
  { operation: "TEACHER_ALLOCATIONS_IMPORT", label: "Teacher allocation import", direction: "IMPORT", platformAllowed: true, subscriptionAllowed: true, schoolEnabled: true, approvalRequired: true, allowedRoles: ["SCHOOL_ADMIN", "DIRECTOR_OF_STUDIES"], scope: "SCHOOL", limit: 1000 },
  { operation: "MARKS_IMPORT", label: "Marks import", direction: "IMPORT", platformAllowed: true, subscriptionAllowed: true, schoolEnabled: true, approvalRequired: true, allowedRoles: ["SCHOOL_ADMIN", "DIRECTOR_OF_STUDIES", "HOD", "TEACHER"], scope: "ASSIGNMENT", limit: 500 },
  { operation: "LEARNERS_EXPORT", label: "Learner export", direction: "EXPORT", platformAllowed: true, subscriptionAllowed: true, schoolEnabled: true, approvalRequired: false, allowedRoles: ["SCHOOL_ADMIN", "DIRECTOR_OF_STUDIES"], scope: "SCHOOL", limit: 10000 },
  { operation: "STAFF_EXPORT", label: "Staff export", direction: "EXPORT", platformAllowed: true, subscriptionAllowed: true, schoolEnabled: true, approvalRequired: false, allowedRoles: ["SCHOOL_ADMIN"], scope: "SCHOOL", limit: 5000 },
  { operation: "MARKS_EXPORT", label: "Marks export", direction: "EXPORT", platformAllowed: true, subscriptionAllowed: true, schoolEnabled: true, approvalRequired: false, allowedRoles: ["SCHOOL_ADMIN", "DIRECTOR_OF_STUDIES", "HOD", "TEACHER"], scope: "ASSIGNMENT", limit: 10000 },
  { operation: "RESULTS_EXPORT", label: "Results export", direction: "EXPORT", platformAllowed: true, subscriptionAllowed: true, schoolEnabled: true, approvalRequired: false, allowedRoles: ["SCHOOL_ADMIN", "DIRECTOR_OF_STUDIES", "HOD"], scope: "DEPARTMENT", limit: 10000 },
  { operation: "CONTROLLED_TEMPLATE_DOWNLOAD", label: "Controlled templates", direction: "TEMPLATE", platformAllowed: true, subscriptionAllowed: true, schoolEnabled: true, approvalRequired: false, allowedRoles: ["SCHOOL_ADMIN", "DIRECTOR_OF_STUDIES", "HOD", "TEACHER"], scope: "ASSIGNMENT", limit: null },
];

type ImportExportWorkspaceValue = {
  importJobs: ImportJob[];
  exportJobs: ExportJob[];
  settings: ImportExportSettings;
  policies: ExchangePolicy[];
  recordImport: (job: Omit<ImportJob, "id" | "user" | "createdAt">) => ImportJob;
  recordExport: (job: Omit<ExportJob, "id" | "requestedBy" | "createdAt">) => ExportJob;
  saveSettings: (settings: ImportExportSettings) => void;
  savePolicies: (policies: ExchangePolicy[]) => void;
  operationAllowed: (operation: ExchangePolicy["operation"]) => { allowed: boolean; reason: string; approvalRequired: boolean };
  auditEvents: { type: string; detail: string; at: string }[];
};

const ImportExportWorkspaceContext = createContext<ImportExportWorkspaceValue | null>(null);

export function ImportExportWorkspaceProvider({ children }: { children: ReactNode }) {
  const [importJobs, setImportJobs] = useState<ImportJob[]>([]);
  const [exportJobs, setExportJobs] = useState<ExportJob[]>([]);
  const [settings, setSettings] = useState(recommendedSettings);
  const [policies, setPolicies] = useState(defaultPolicies);
  const [auditEvents, setAuditEvents] = useState<{ type: string; detail: string; at: string }[]>([]);

  const value = useMemo<ImportExportWorkspaceValue>(() => ({
    importJobs, exportJobs, settings, policies, auditEvents,
    recordImport(job) {
      const entry: ImportJob = { ...job, id: `import-${crypto.randomUUID()}`, user: currentUser.name, createdAt: new Date().toISOString() };
      setImportJobs((current) => [entry, ...current]);
      const eventType = entry.status === "FAILED" ? "IMPORT_FAILED" : "IMPORT_COMMITTED";
      setAuditEvents((current) => [{ type: eventType, detail: `${entry.type}: ${entry.fileName} · ${entry.totalRows} row(s)`, at: entry.createdAt }, ...current]);
      return entry;
    },
    recordExport(job) {
      const entry: ExportJob = { ...job, id: `export-${crypto.randomUUID()}`, requestedBy: currentUser.name, createdAt: new Date().toISOString() };
      setExportJobs((current) => [entry, ...current]);
      setAuditEvents((current) => [{ type: "EXPORT_GENERATED", detail: `${entry.type} · ${entry.format} · ${entry.recordCount} record(s)`, at: entry.createdAt }, ...current]);
      return entry;
    },
    saveSettings(next) {
      setSettings(next);
      setAuditEvents((current) => [{ type: "IMPORT_EXPORT_SETTINGS_CHANGED", detail: "School import/export defaults updated; mandatory validation remains enabled.", at: new Date().toISOString() }, ...current]);
    },
    savePolicies(next) {
      setPolicies(next);
      setAuditEvents((current) => [{ type: "SCHOOL_IMPORT_EXPORT_POLICY_CHANGED", detail: "School data-exchange policies updated. Platform denials remain authoritative.", at: new Date().toISOString() }, ...current]);
    },
    operationAllowed(operation) {
      const policy = policies.find((item) => item.operation === operation);
      if (!policy?.platformAllowed) return { allowed: false, reason: "Disabled by Platform Policy.", approvalRequired: false };
      if (!policy.subscriptionAllowed) return { allowed: false, reason: "Unavailable under the current subscription.", approvalRequired: false };
      if (!policy.schoolEnabled) return { allowed: false, reason: "Not permitted by school policy.", approvalRequired: false };
      if (!policy.allowedRoles.includes(currentUser.role)) return { allowed: false, reason: "Not permitted for your school role.", approvalRequired: false };
      return { allowed: true, reason: policy.approvalRequired ? "Approval is required before commit." : "Allowed in the configured scope.", approvalRequired: policy.approvalRequired };
    },
  }), [auditEvents, exportJobs, importJobs, policies, settings]);

  return <ImportExportWorkspaceContext.Provider value={value}>{children}</ImportExportWorkspaceContext.Provider>;
}

export function useImportExportWorkspace() {
  const value = useContext(ImportExportWorkspaceContext);
  if (!value) throw new Error("ImportExportWorkspaceProvider is missing.");
  return value;
}
