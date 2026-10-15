export const emptySubjectFeedback = {
    achievement: "", improvement: "", nextStep: "", teacherComment: "",
};
export function reportNarrativeComplete(narrative, offeringIds) {
    void offeringIds;
    if (!narrative?.classTeacherComment.trim() || !narrative.headTeacherComment.trim())
        return false;
    const acceptedStatuses = ["REVIEWED", "EDITED", "APPROVED", "PUBLISHED"];
    const requiredRecords = ["CLASS_TEACHER", "HEAD_TEACHER"];
    if (!requiredRecords.every((key) => narrative.commentRecords[key] && acceptedStatuses.includes(narrative.commentRecords[key].status) && narrative.commentRecords[key].finalComment.trim()))
        return false;
    return true;
}
export function cloneMarks(marks) {
    return { ...marks };
}
