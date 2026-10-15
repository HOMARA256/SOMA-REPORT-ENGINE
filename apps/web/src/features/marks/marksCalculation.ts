import { convertPercentageToThreePoint, formatThreePoint, getOLLevelGradingBand, type MarkState } from "./gradingConfiguration";

export type MarksPreview = {
  total: string;
  final: string;
  grade: string;
  descriptor: string;
  state: MarkState | "VALIDATION_ERROR";
  defaultComment: string;
  threePointScoreExact: number | null;
  threePointScoreDisplayed: string;
  gradingBandId: string;
  gradingLabel: string;
  gradingAbbreviation: string;
};

export function getMarksPreview(
  continuousAssessment: string,
  examination: string,
  continuousAssessmentState: MarkState = continuousAssessment === "" ? "MISSING" : "PRESENT",
  examinationState: MarkState = examination === "" ? "MISSING" : "PRESENT",
): MarksPreview {
  const componentStates: MarkState[] = [
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
  if (threePointScoreExact === null) return { total: "—", final: "—", grade: "—", descriptor: "Conversion configuration unavailable", state: "VALIDATION_ERROR", defaultComment: "", threePointScoreExact: null, threePointScoreDisplayed: "—", gradingBandId: "", gradingLabel: "", gradingAbbreviation: "" };
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
