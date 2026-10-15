import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../../config/supabaseClient";
import { useSchoolContext } from "../context/SchoolContext";
export const reportableProfileFields = {
    logoUrl: "School logo", officialName: "Official school name", shortName: "Short school name",
    motto: "School motto", slogan: "School slogan", schoolCode: "School code",
    registrationNumber: "Registration number", unebCentreNumber: "UNEB centre number",
    emisNumber: "EMIS number", schoolLevel: "School level", schoolType: "School type",
    ownership: "School ownership", genderCategory: "Gender category", yearEstablished: "Year established",
    physicalAddress: "Physical address", postalAddress: "Postal address", district: "District / City",
    country: "Country", primaryTelephone: "Telephone", officialEmail: "Email", website: "Website",
    headTeacherName: "Head Teacher", directorOfStudiesName: "Director of Studies",
    secondaryLogoUrl: "Secondary logo", sealUrl: "School seal",
};
const initialProfile = {
    officialName: "", shortName: "", motto: "", slogan: "", schoolCode: "",
    registrationNumber: "", unebCentreNumber: "", emisNumber: "",
    schoolLevel: "", schoolType: "", ownership: "", genderCategory: "", yearEstablished: "", country: "Uganda",
    physicalAddress: "", postalAddress: "", village: "", parish: "", subcounty: "", district: "",
    region: "", primaryTelephone: "", secondaryTelephone: "", alternativeTelephone: "",
    officialEmail: "omarawilling@gmail.com", alternativeEmail: "", website: "", headTeacherName: "",
    deputyHeadTeacherName: "", directorOfStudiesName: "", academicContact: "",
    programmesOffered: "", logoUrl: "", secondaryLogoUrl: "", sealUrl: "",
    primaryColour: "#173b79", secondaryColour: "#e8f0ff", reportHeaderStyle: "CENTRED",
    additionalInformation: "",
};
export const recommendedHeaderFields = [
    "logoUrl", "officialName", "motto", "postalAddress", "primaryTelephone", "officialEmail", "unebCentreNumber",
];
const initialHeaderSettings = {
    visibleFields: recommendedHeaderFields.filter((key) => Boolean(initialProfile[key])),
    displayOrder: ["postalAddress", "primaryTelephone", "officialEmail", "website", "unebCentreNumber"],
    reportInformation: { reportTitle: true, programme: true, academicYear: true, term: true, reportType: false },
    template: "SCHOOL_DEFAULT",
    learnerInformation: { learnerName: true, admissionNumber: true, className: true, stream: true, term: true, year: true, gender: false },
    resultsTable: { subject: true, continuousAssessment: true, examination: true, percentage: true, threePoint: true, descriptor: true, competency: true, teacherInitials: true },
    commentsSignatures: { classTeacherComment: true, classTeacherSignature: true, headTeacherComment: true, headTeacherSignature: true },
    gradingScheme: { show: true, percentageRanges: true, descriptors: true, scaleInformation: true },
    numberFormatting: { percentageDecimalPlaces: 1, threePointDecimalPlaces: 1, maximumCommentLength: 220, maximumCompetencyLength: 82 },
    media: { showSchoolLogo: true, showStudentPhoto: true, missingPhotoPolicy: "NEUTRAL_PLACEHOLDER" },
    subjectDisplay: "SHORT_CODE",
    additionalInformation: { attendance: true, nextTermBegins: true, feesStatus: false, nextTermStartDate: "2026-09-14" },
};
const SchoolSettingsContext = createContext(null);
export function SchoolSettingsProvider({ children }) {
    const schoolContext = useSchoolContext();
    const [profile, setProfile] = useState(initialProfile);
    const [configurationAttention, setConfigurationAttention] = useState(false);
    const [headerSettings, setHeaderSettings] = useState(initialHeaderSettings);
    const [auditEvents, setAuditEvents] = useState([]);
    useEffect(() => {
        let active = true;
        async function loadIdentity() {
            if (!supabase || !schoolContext.schoolId || schoolContext.loading)
                return;
            const { data: canonicalProfile } = await supabase.from("school_profiles").select("official_name,short_name,logo_url,profile_status").eq("school_id", schoolContext.schoolId).maybeSingle();
            const { data: school } = await supabase.from("schools").select("official_name,short_name,school_code,email,telephone,address,logo_url,emis_number,school_level,school_type,district,primary_colour,secondary_colour,report_header_style").eq("id", schoolContext.schoolId).maybeSingle();
            if (!school || !active)
                return;
            setConfigurationAttention(!canonicalProfile || canonicalProfile.profile_status !== "CONFIGURED");
            setProfile((current) => ({ ...current, officialName: canonicalProfile?.official_name || school.official_name, shortName: canonicalProfile?.short_name ?? school.short_name ?? "", schoolCode: school.school_code, officialEmail: school.email ?? "", primaryTelephone: school.telephone ?? "", physicalAddress: school.address ?? "", logoUrl: school.logo_url ?? canonicalProfile?.logo_url ?? "", emisNumber: school.emis_number ?? "", schoolLevel: school.school_level ?? "", schoolType: school.school_type ?? "", district: school.district ?? "", primaryColour: school.primary_colour, secondaryColour: school.secondary_colour, reportHeaderStyle: school.report_header_style }));
        }
        void loadIdentity();
        return () => { active = false; };
    }, [schoolContext.schoolId, schoolContext.loading]);
    useEffect(() => { const name = /not configured/i.test(profile.officialName) ? "" : profile.officialName; document.title = name ? `${name} | SOMA REPORT ENGINE` : "SOMA REPORT ENGINE"; }, [profile.officialName]);
    const value = useMemo(() => ({
        profile, configurationAttention, headerSettings, auditEvents,
        saveProfile(next) {
            const changed = Object.keys(next).filter((key) => next[key] !== profile[key]);
            setProfile({ ...next });
            setHeaderSettings((current) => ({ ...current, visibleFields: current.visibleFields.filter((key) => Boolean(next[key])) }));
            if (changed.length)
                setAuditEvents((current) => [{ type: changed.includes("logoUrl") ? "SCHOOL_LOGO_CHANGED" : "SCHOOL_PROFILE_UPDATED", detail: changed.join(", "), at: new Date().toISOString() }, ...current]);
        },
        saveHeaderSettings(next) {
            setHeaderSettings({ ...next, visibleFields: next.visibleFields.filter((key) => Boolean(profile[key])), learnerInformation: { ...next.learnerInformation }, resultsTable: { ...next.resultsTable }, commentsSignatures: { ...next.commentsSignatures }, gradingScheme: { ...next.gradingScheme }, numberFormatting: { ...next.numberFormatting }, media: { ...next.media }, additionalInformation: { ...next.additionalInformation } });
            setAuditEvents((current) => [{ type: "REPORT_HEADER_CONFIGURATION_CHANGED", detail: "Report header visibility and display order updated", at: new Date().toISOString() }, ...current]);
        },
        resolveHeader() {
            return {
                values: Object.fromEntries(headerSettings.visibleFields.filter((key) => Boolean(profile[key])).map((key) => [key, profile[key]])),
                displayOrder: [...headerSettings.displayOrder], reportInformation: { ...headerSettings.reportInformation },
                primaryColour: profile.primaryColour, secondaryColour: profile.secondaryColour, headerStyle: profile.reportHeaderStyle,
                displaySettings: { learnerInformation: { ...headerSettings.learnerInformation }, resultsTable: { ...headerSettings.resultsTable }, commentsSignatures: { ...headerSettings.commentsSignatures }, gradingScheme: { ...headerSettings.gradingScheme }, numberFormatting: { ...headerSettings.numberFormatting }, media: { ...headerSettings.media }, subjectDisplay: headerSettings.subjectDisplay, additionalInformation: { ...headerSettings.additionalInformation } },
            };
        },
    }), [profile, configurationAttention, headerSettings, auditEvents]);
    return <SchoolSettingsContext.Provider value={value}>{children}</SchoolSettingsContext.Provider>;
}
export function useSchoolSettings() {
    const context = useContext(SchoolSettingsContext);
    if (!context)
        throw new Error("School settings are not available.");
    return context;
}
