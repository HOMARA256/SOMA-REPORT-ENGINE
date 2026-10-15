import { createContext, useContext, useMemo, useState } from "react";
import { currentUser } from "../../config/currentUser";
const recommendedSettings = {
    marks: true, learners: true, staff: true, allocations: true, academic: true, competencies: true, media: true,
    allowDecimalMarks: true, allowCsvExports: true, bulkLearnerPhotos: true, dateFormat: "YYYY-MM-DD",
    requireWarningAcknowledgement: true, sourceFileRetentionDays: 30,
};
const defaultPolicies = [
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
const ImportExportWorkspaceContext = createContext(null);
export function ImportExportWorkspaceProvider({ children }) {
    const [importJobs, setImportJobs] = useState([]);
    const [exportJobs, setExportJobs] = useState([]);
    const [settings, setSettings] = useState(recommendedSettings);
    const [policies, setPolicies] = useState(defaultPolicies);
    const [auditEvents, setAuditEvents] = useState([]);
    const value = useMemo(() => ({
        importJobs, exportJobs, settings, policies, auditEvents,
        recordImport(job) {
            const entry = { ...job, id: `import-${crypto.randomUUID()}`, user: currentUser.name, createdAt: new Date().toISOString() };
            setImportJobs((current) => [entry, ...current]);
            const eventType = entry.status === "FAILED" ? "IMPORT_FAILED" : "IMPORT_COMMITTED";
            setAuditEvents((current) => [{ type: eventType, detail: `${entry.type}: ${entry.fileName} · ${entry.totalRows} row(s)`, at: entry.createdAt }, ...current]);
            return entry;
        },
        recordExport(job) {
            const entry = { ...job, id: `export-${crypto.randomUUID()}`, requestedBy: currentUser.name, createdAt: new Date().toISOString() };
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
            if (!policy?.platformAllowed)
                return { allowed: false, reason: "Disabled by Platform Policy.", approvalRequired: false };
            if (!policy.subscriptionAllowed)
                return { allowed: false, reason: "Unavailable under the current subscription.", approvalRequired: false };
            if (!policy.schoolEnabled)
                return { allowed: false, reason: "Not permitted by school policy.", approvalRequired: false };
            if (!policy.allowedRoles.includes(currentUser.role))
                return { allowed: false, reason: "Not permitted for your school role.", approvalRequired: false };
            return { allowed: true, reason: policy.approvalRequired ? "Approval is required before commit." : "Allowed in the configured scope.", approvalRequired: policy.approvalRequired };
        },
    }), [auditEvents, exportJobs, importJobs, policies, settings]);
    return <ImportExportWorkspaceContext.Provider value={value}>{children}</ImportExportWorkspaceContext.Provider>;
}
export function useImportExportWorkspace() {
    const value = useContext(ImportExportWorkspaceContext);
    if (!value)
        throw new Error("ImportExportWorkspaceProvider is missing.");
    return value;
}
