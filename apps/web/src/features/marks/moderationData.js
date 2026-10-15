export const moderationBatches = [
    {
        id: "MOD-2026-002",
        programme: "O_LEVEL",
        className: "Senior 2B",
        subject: "English Language",
        assessment: "Term II assessment",
        teacher: "Sarah Atim",
        learnerCount: 38,
        submittedAt: "19 Sep 2026",
        status: "READY",
        issues: [
            {
                id: "MOD-2026-002-1",
                severity: "BLOCKER",
                title: "Required examination mark missing",
                detail: "A required component has no recorded mark or authorised absent/exempt decision.",
            },
            {
                id: "MOD-2026-002-2",
                severity: "REVIEW",
                title: "Absent state needs supporting record",
                detail: "Confirm the learner absence record before this batch can advance.",
            },
        ],
    },
    {
        id: "MOD-2026-003",
        programme: "A_LEVEL",
        className: "Senior 5 Sciences",
        subject: "Physics",
        assessment: "Term II school assessment",
        teacher: "Peter Kato",
        learnerCount: 22,
        submittedAt: "20 Sep 2026",
        status: "HOD_REVIEW",
        issues: [
            {
                id: "MOD-2026-003-1",
                severity: "BLOCKER",
                title: "Practical component incomplete",
                detail: "The required practical component is missing. This subject cannot be treated as complete.",
            },
        ],
    },
    {
        id: "MOD-2026-004",
        programme: "O_LEVEL",
        className: "Senior 4A",
        subject: "Biology",
        assessment: "Term II assessment",
        teacher: "David Mugiisha",
        learnerCount: 31,
        submittedAt: "16 Sep 2026",
        status: "MODERATED",
        issues: [],
    },
];
export const moderationStatusLabels = {
    HOD_REVIEW: "HOD review",
    READY: "Ready for moderation",
    MODERATED: "Moderated",
    RETURNED: "Returned to teacher",
};
