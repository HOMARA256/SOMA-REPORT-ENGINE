export type MarkState = "PRESENT" | "MISSING" | "ABSENT" | "EXEMPT";

export type GradingBand = {
  numericValue: string;
  minimumPercentage: number;
  maximumPercentage: number;
  label: string;
  abbreviation: string;
  descriptor: string;
  defaultComment: string;
  displayOrder: number;
};

export type ConversionPoint = { percentage: number; threePointValue: number };
export type ThreePointConversionConfiguration = {
  id: string; name: string; version: string; method: "PIECEWISE_LINEAR"; approved: boolean;
  effectiveFrom: string; effectiveTo: string | null; status: "DRAFT" | "ACTIVE" | "RETIRED";
  aggregationRule: "ARITHMETIC_MEAN" | "WEIGHTED_MEAN" | "SCHOOL_APPROVED_RULE"; displayDecimalPlaces: 1; points: ConversionPoint[];
};

export const activeOLLevelGradingConfiguration = {
  id: "nlsc-competency-school-configuration-v1",
  programme: "O_LEVEL",
  name: "NLSC Competency Scale — School Configuration",
  version: "1.0",
  effectiveFrom: "2026-01-01",
  isActive: true,
  bands: [
    { numericValue: "3.0", minimumPercentage: 80, maximumPercentage: 100, label: "Excellent", abbreviation: "E", descriptor: "The learner demonstrates excellent understanding and application of the required knowledge and skills and handles learning tasks with a high level of independence and confidence.", defaultComment: "Demonstrates excellent understanding and application of the required competencies. Continue extending learning through challenging and independent tasks.", displayOrder: 1 },
    { numericValue: "2.5", minimumPercentage: 70, maximumPercentage: 79.999999, label: "Outstanding", abbreviation: "O", descriptor: "The learner demonstrates strong understanding of the required knowledge and skills and applies them effectively in most learning situations.", defaultComment: "Demonstrates strong achievement of the required competencies and applies learning effectively. Continue strengthening accuracy, depth and independent application.", displayOrder: 2 },
    { numericValue: "2.0", minimumPercentage: 60, maximumPercentage: 69.999999, label: "Moderate", abbreviation: "M", descriptor: "The learner demonstrates satisfactory achievement of the essential competencies but requires further practice to improve consistency, accuracy and application.", defaultComment: "Has achieved the essential competencies at a satisfactory level. Additional practice and application are recommended to strengthen understanding and consistency.", displayOrder: 3 },
    { numericValue: "1.5", minimumPercentage: 50, maximumPercentage: 59.999999, label: "Basic", abbreviation: "B", descriptor: "The learner demonstrates partial achievement of the required competencies and needs guided support in important areas of learning.", defaultComment: "Demonstrates basic achievement of the required competencies but requires additional guided practice and support in identified areas.", displayOrder: 4 },
    { numericValue: "1.0", minimumPercentage: 0, maximumPercentage: 49.999999, label: "Elementary", abbreviation: "E", descriptor: "The learner demonstrates limited achievement of the required competencies and requires structured support before progressing to more demanding learning tasks.", defaultComment: "Demonstrates limited achievement of the required competencies. Targeted support, additional practice and close follow-up are required.", displayOrder: 5 },
  ] satisfies GradingBand[],
};

// Explicitly versioned review-school rule. The points are configured data, not
// inferred from achievement bands. Production activation requires approval.
export const activeThreePointConversionConfiguration: ThreePointConversionConfiguration = {
  id: "ol-three-point-conversion-review-v1", name: "Approved O-Level 3-point conversion",
  version: "1.0", method: "PIECEWISE_LINEAR", approved: true,
  effectiveFrom: "2026-01-01", effectiveTo: null, status: "ACTIVE",
  aggregationRule: "ARITHMETIC_MEAN", displayDecimalPlaces: 1,
  points: [
    { percentage: 0, threePointValue: 1 }, { percentage: 49, threePointValue: 1.4 },
    { percentage: 50, threePointValue: 1.5 }, { percentage: 59, threePointValue: 1.8 },
    { percentage: 60, threePointValue: 1.9 }, { percentage: 64, threePointValue: 2.1 },
    { percentage: 69, threePointValue: 2.3 }, { percentage: 70, threePointValue: 2.4 },
    { percentage: 74, threePointValue: 2.6 }, { percentage: 79, threePointValue: 2.7 },
    { percentage: 80, threePointValue: 2.7 }, { percentage: 83, threePointValue: 2.8 },
    { percentage: 89, threePointValue: 2.9 }, { percentage: 100, threePointValue: 3 },
  ],
};

export function convertPercentageToThreePoint(score: number, configuration = activeThreePointConversionConfiguration) {
  if (!configuration.approved || !Number.isFinite(score) || score < 0 || score > 100) return null;
  const points = [...configuration.points].sort((a, b) => a.percentage - b.percentage);
  const exact = points.find((point) => point.percentage === score)?.threePointValue;
  if (exact !== undefined) return exact;
  const upperIndex = points.findIndex((point) => point.percentage > score);
  if (upperIndex <= 0) return points[0]?.threePointValue ?? null;
  const lower = points[upperIndex - 1]; const upper = points[upperIndex];
  const ratio = (score - lower.percentage) / (upper.percentage - lower.percentage);
  return lower.threePointValue + ratio * (upper.threePointValue - lower.threePointValue);
}

export function formatThreePoint(value: number) { return value.toFixed(1); }

export function getOLLevelGradingBand(score: number) {
  return activeOLLevelGradingConfiguration.bands.find((band) => score >= band.minimumPercentage && score <= band.maximumPercentage);
}
