const prohibitedClaims = [
    /\b(lazy|careless|stubborn|dishonest|badly behaved|poor attitude)\b/i,
    /\b(always|never)\b/i,
];
function validateGeneratedText(text) {
    return prohibitedClaims
        .filter((pattern) => pattern.test(text))
        .map(() => "The generated wording contains an unsupported or prohibited behavioural claim.");
}
function incompleteSubjectComment(evidence) {
    if (evidence.assessmentState === "ABSENT")
        return "Assessment evidence is incomplete because the learner was recorded as absent for an applicable component. No reason for the absence has been inferred.";
    if (evidence.assessmentState === "EXEMPT")
        return "The learner was recorded as exempt from an applicable assessment component. The exemption has not been treated as zero.";
    if (evidence.assessmentState === "VALIDATION_ERROR")
        return "Assessment evidence requires correction before a reliable subject comment can be prepared.";
    return "Assessment evidence for this reporting period is incomplete because one or more required components have not been recorded.";
}
function subjectComment(request) {
    const subject = request.subject;
    if (!subject)
        throw new Error("Subject evidence is required for a subject-teacher comment.");
    if (subject.assessmentState !== "PRESENT" || subject.total === null) {
        return buildResult(incompleteSubjectComment(subject), [
            `${subject.subjectName}: ${subject.assessmentState}`,
        ], request.templateVersion, "INCOMPLETE_EVIDENCE");
    }
    const evidenceUsed = [
        `${subject.subjectName} total: ${subject.total}%`,
        `Configured descriptor: ${subject.descriptor ?? "not configured"}`,
        ...subject.components.map((item) => `${item.label}: ${item.score ?? item.state}/${item.maximum}`),
    ];
    const outcomes = subject.assessedOutcomes ?? [];
    const observations = subject.authorisedObservations ?? [];
    if (!outcomes.length && !observations.length) {
        return buildResult(`${request.learnerFirstName}'s recorded ${subject.subjectName} result is ${subject.total}%${subject.descriptor ? `, classified as ${subject.descriptor}` : ""}. Add a specific assessed learning outcome or authorised teacher observation before approval.`, evidenceUsed, request.templateVersion, "LIMITED_EVIDENCE");
    }
    const strongest = outcomes[0];
    const evidenceSentence = strongest
        ? `Recorded evidence for ${strongest.outcome} is ${strongest.level}.`
        : observations[0];
    return buildResult(`${request.learnerFirstName}'s recorded ${subject.subjectName} result is ${subject.total}%${subject.descriptor ? `, classified as ${subject.descriptor}` : ""}. ${evidenceSentence}`, [...evidenceUsed, ...outcomes.map((item) => `${item.outcome}: ${item.level} (${item.evidence})`), ...observations], request.templateVersion, "SUFFICIENT_EVIDENCE");
}
function wholeLearnerComment(request) {
    const subjects = request.subjects ?? [];
    const complete = subjects.filter((item) => item.assessmentState === "PRESENT" && item.total !== null);
    const incomplete = subjects.length - complete.length;
    if (!complete.length) {
        return buildResult(`${request.learnerFirstName} does not yet have enough complete assessment evidence for an academic summary. Required records must be completed or authorised before approval.`, [`0 of ${subjects.length} subject records complete`], request.templateVersion, "INCOMPLETE_EVIDENCE");
    }
    const average = complete.reduce((sum, item) => sum + (item.total ?? 0), 0) / complete.length;
    const strongest = [...complete].sort((a, b) => (b.total ?? 0) - (a.total ?? 0))[0];
    const support = [...complete].sort((a, b) => (a.total ?? 0) - (b.total ?? 0))[0];
    const roleSentence = request.roleType === "CLASS_TEACHER"
        ? "Class-teacher observations must be added before this draft is approved."
        : request.roleType === "DOS"
            ? "Comparable prior-period evidence has not been inferred."
            : "The identified academic priorities should be reviewed for the next reporting period.";
    const comment = `${request.learnerFirstName} has complete evidence in ${complete.length} of ${subjects.length} configured subjects, with a recorded average of ${average.toFixed(1)}%. ${strongest.subjectName} has the highest recorded result.${support !== strongest ? ` ${support.subjectName} is the current academic support priority.` : ""} ${roleSentence}`;
    return buildResult(comment, [
        `${complete.length} of ${subjects.length} subject records complete`,
        `Average: ${average.toFixed(1)}%`,
        ...(request.attendanceSummary ? [`Attendance: ${request.attendanceSummary}`] : []),
        ...(request.priorPeriodSummary ? [`Prior period: ${request.priorPeriodSummary}`] : []),
    ], request.templateVersion, incomplete || (request.roleType === "CLASS_TEACHER" && !request.attendanceSummary) ? "LIMITED_EVIDENCE" : "SUFFICIENT_EVIDENCE");
}
function buildResult(comment, evidenceUsed, templateVersion, confidenceState) {
    const warnings = validateGeneratedText(comment);
    const requiresAttention = warnings.length > 0 || confidenceState !== "SUFFICIENT_EVIDENCE";
    return {
        generatedComment: comment,
        finalComment: comment,
        status: requiresAttention ? "REQUIRES_ATTENTION" : "GENERATED",
        confidenceState,
        evidenceUsed,
        templateVersion,
        generationMethod: "DETERMINISTIC_RULES",
        warnings,
    };
}
/**
 * Pure, deterministic comment generation. Persistence, authorization, audit
 * recording and approval transitions remain the responsibility of the API
 * application layer; callers must never accept schoolId or role scope without
 * validating the signed-in user's active membership and allocation.
 */
export class ReportCommentService {
    generate(request) {
        return request.roleType === "SUBJECT_TEACHER"
            ? subjectComment(request)
            : wholeLearnerComment(request);
    }
    validateForApproval(comment) {
        const errors = [...comment.warnings];
        if (!comment.finalComment.trim())
            errors.push("A final comment is required.");
        if (!comment.evidenceUsed.length)
            errors.push("An evidence snapshot is required.");
        if (comment.confidenceState === "INCOMPLETE_EVIDENCE")
            errors.push("Incomplete evidence must be resolved before approval.");
        return errors;
    }
}
