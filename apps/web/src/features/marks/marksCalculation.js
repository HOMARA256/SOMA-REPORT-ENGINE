import { convertPercentageToThreePoint, formatThreePoint, getOLLevelGradingBand } from "./gradingConfiguration";
export function getMarksPreview(continuousAssessment, examination, continuousAssessmentState = continuousAssessment === "" ? "MISSING" : "PRESENT", examinationState = examination === "" ? "MISSING" : "PRESENT") {
    const componentStates = [
        continuousAssessmentState,
        examinationState,
    ];
    const nonPresentState = componentStates.find((state) => state !== "PRESENT");
    if (nonPresentState) {
        return {
            total: "—",
            final: "—",
            grade: "—",
            descriptor: nonPresentState,
            state: nonPresentState,
            defaultComment: "",
            threePointScoreExact: null, threePointScoreDisplayed: "—", gradingBandId: "", gradingLabel: "", gradingAbbreviation: "",
        };
    }
    if (continuousAssessment === "" || examination === "") {
        return {
            total: "—",
            final: "—",
            grade: "—",
            descriptor: "MISSING",
            state: "MISSING",
            defaultComment: "",
            threePointScoreExact: null, threePointScoreDisplayed: "—", gradingBandId: "", gradingLabel: "", gradingAbbreviation: "",
        };
    }
    const total = Number(continuousAssessment) + Number(examination);
    if (!Number.isFinite(total) || total < 0 || total > 100) {
        return {
            total: "—",
            final: "—",
            grade: "—",
            descriptor: "Invalid score",
            state: "VALIDATION_ERROR",
            defaultComment: "",
            threePointScoreExact: null, threePointScoreDisplayed: "—", gradingBandId: "", gradingLabel: "", gradingAbbreviation: "",
        };
    }
    const gradingBand = getOLLevelGradingBand(total);
    if (!gradingBand) {
        return {
            total: "—",
            final: "—",
            grade: "—",
            descriptor: "No active grading band",
            state: "VALIDATION_ERROR",
            defaultComment: "",
            threePointScoreExact: null, threePointScoreDisplayed: "—", gradingBandId: "", gradingLabel: "", gradingAbbreviation: "",
        };
    }
    const threePointScoreExact = convertPercentageToThreePoint(total);
    if (threePointScoreExact === null)
        return { total: "—", final: "—", grade: "—", descriptor: "Conversion configuration unavailable", state: "VALIDATION_ERROR", defaultComment: "", threePointScoreExact: null, threePointScoreDisplayed: "—", gradingBandId: "", gradingLabel: "", gradingAbbreviation: "" };
    return {
        total: String(total),
        final: `${total}%`,
        grade: formatThreePoint(threePointScoreExact),
        descriptor: `${gradingBand.label} (${gradingBand.abbreviation})`,
        state: "PRESENT",
        defaultComment: gradingBand.defaultComment,
        threePointScoreExact,
        threePointScoreDisplayed: formatThreePoint(threePointScoreExact),
        gradingBandId: `band-${gradingBand.displayOrder}`,
        gradingLabel: gradingBand.label,
        gradingAbbreviation: gradingBand.abbreviation,
    };
}
