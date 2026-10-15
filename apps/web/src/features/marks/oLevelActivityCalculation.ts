import { convertPercentageToThreePoint, formatThreePoint } from "./gradingConfiguration";
import { getMarksPreview } from "./marksCalculation";
import type { PersistentMarkState } from "./PersistentMarks";

export function calculateOLevelActivityResults(input: {
  activity1Raw: number | null; activity1Status: PersistentMarkState;
  activity2Raw: number | null; activity2Status: PersistentMarkState;
  examRaw: number | null; examStatus: PersistentMarkState;
}) {
  const a1 = input.activity1Status === "PRESENT" && input.activity1Raw !== null ? convertPercentageToThreePoint(input.activity1Raw) : null;
  const a2 = input.activity2Status === "PRESENT" && input.activity2Raw !== null ? convertPercentageToThreePoint(input.activity2Raw) : null;
  const formative = a1 !== null && a2 !== null ? Math.round(((a1 + a2) / 2 / 3 * 20) * 100) / 100 : null;
  const exam = input.examStatus === "PRESENT" && input.examRaw !== null ? Math.round(input.examRaw * 0.8 * 100) / 100 : null;
  const formativeStatus: PersistentMarkState = input.activity1Status === "ABSENT" || input.activity2Status === "ABSENT" ? "ABSENT"
    : input.activity1Status === "EXEMPT" || input.activity2Status === "EXEMPT" ? "EXEMPT"
      : formative === null ? "MISSING" : "PRESENT";
  const preview = getMarksPreview(formative === null ? "" : String(formative), exam === null ? "" : String(exam), formativeStatus, input.examStatus);
  return { a1, a2, a1Displayed: a1 === null ? "—" : formatThreePoint(a1), a2Displayed: a2 === null ? "—" : formatThreePoint(a2), formative, exam, preview };
}
