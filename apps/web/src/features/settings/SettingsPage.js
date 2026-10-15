import { Building2, FileCog, Palette, CalendarDays, MessageSquareText, ShieldCheck, FileSpreadsheet, GraduationCap, UserRoundCog } from "lucide-react";
import { Link } from "react-router-dom";
const areas = [
    { to: "/settings/school-profile", icon: Building2, title: "School Profile", text: "Identity, location, contacts, administration, academic identity and branding." },
    { to: "/settings/report-card/header", icon: FileCog, title: "Report Card Settings", text: "Choose completed school-profile fields shown in report headers and preview the result." },
    { to: "/settings/school-profile", icon: Palette, title: "Branding & Appearance", text: "School logos, seal, report colours and header style." },
    { to: "/setup/academic-years", icon: CalendarDays, title: "Calendar & Important Dates", text: "Academic years, terms and lifecycle dates." },
    { to: "/reports/cards", icon: MessageSquareText, title: "Automatic Comments", text: "Evidence-based comments, staff review and report preparation." },
    { to: "/results/approvals", icon: ShieldCheck, title: "Result Workflow & Approval", text: "Moderation, result locks, approvals and publication readiness." },
    { to: "/settings/approval-delegations", icon: UserRoundCog, title: "Approval Delegation", text: "Time-bound authority, approval limits, fallback roles and delegation audit history." },
    { to: "/settings/import-export", icon: FileSpreadsheet, title: "Import & Export Settings", text: "Controlled import types, workbook defaults, retention and export formats." },
    { to: "/settings/academics/a-level/grading", icon: GraduationCap, title: "A-Level Internal Grading", text: "Versioned principal, General Paper and subsidiary grades, points and descriptors." },
];
export function SettingsPage() {
    return <div><header className="page-heading"><div><span className="eyebrow">ADMINISTRATION</span><h1>Settings</h1><p>School-owned configuration. Enter school information once, then select where it appears.</p></div></header><section className="settings-area-grid">{areas.map(({ to, icon: Icon, title, text }) => <Link to={to} key={title}><Icon size={22}/><span><strong>{title}</strong><small>{text}</small></span></Link>)}</section></div>;
}
