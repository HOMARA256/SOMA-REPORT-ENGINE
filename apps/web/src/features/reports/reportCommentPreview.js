const version = "system-report-comments-1.0";
function record(roleType, comment, evidenceUsed, responsibleUser, confidenceState, subjectOfferingId) {
    return { roleType, subjectOfferingId, generatedComment: comment, editedComment: null, finalComment: comment, status: confidenceState === "SUFFICIENT_EVIDENCE" ? "GENERATED" : "REQUIRES_ATTENTION", evidenceUsed, templateVersion: version, generationMethod: "DETERMINISTIC_RULES", confidenceState, responsibleUser, generatedAt: new Date().toISOString(), reviewedAt: null };
}
export function generateReportCommentDrafts({ firstName, subjects, responsibleUser }) {
    const subjectFeedback = {};
    const commentRecords = {};
    const complete = subjects.filter((subject) => subject.state === "PRESENT" && subject.total !== null);
    const incomplete = subjects.filter((subject) => subject.state !== "PRESENT" || subject.total === null);
    const average = complete.length ? complete.reduce((sum, subject) => sum + (subject.total ?? 0), 0) / complete.length : null;
    const strongest = [...complete].sort((a, b) => (b.total ?? 0) - (a.total ?? 0))[0];
    const support = [...complete].sort((a, b) => (a.total ?? 0) - (b.total ?? 0))[0];
    const completion = `${complete.length} of ${subjects.length} configured subjects have complete assessment evidence`;
    const classTeacherComment = average === null
        ? `${firstName} has incomplete assessment evidence. Complete or authorise the outstanding records before this comment is approved.`
        : `${firstName} demonstrates ${average >= 80 ? "excellent" : average >= 70 ? "strong" : average >= 60 ? "steady" : "developing"} academic engagement.${strongest ? ` Continue extending the evident strength in ${strongest.subjectName}.` : ""}${support && support !== strongest ? ` Give focused attention to ${support.subjectName} through regular guided practice.` : ""}`;
    const headTeacherComment = average === null
        ? `The report remains academically incomplete and requires resolution of the outstanding assessment evidence before institutional approval.`
        : `${firstName} has shown ${average >= 80 ? "commendable academic maturity" : average >= 70 ? "promising academic progress" : "valuable academic progress"} this term. Maintain purposeful effort and act on the guidance provided to achieve further growth.`;
    const confidence = incomplete.length ? "INCOMPLETE_EVIDENCE" : "SUFFICIENT_EVIDENCE";
    commentRecords.CLASS_TEACHER = record("CLASS_TEACHER", classTeacherComment, [completion, average === null ? "No complete average" : `Average ${average.toFixed(1)}%`, "No class-teacher observation stored"], responsibleUser, confidence);
    commentRecords.HEAD_TEACHER = record("HEAD_TEACHER", headTeacherComment, [completion, "Institutional summary from current academic record"], responsibleUser, confidence);
    return { classTeacherComment, directorOfStudiesComment: "", headTeacherComment, subjectFeedback, commentRecords };
}
