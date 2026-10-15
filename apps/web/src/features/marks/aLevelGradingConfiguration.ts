export type ALevelSubjectCategory = "PRINCIPAL" | "GENERAL_PAPER" | "SUBSIDIARY";
export type ALevelGradingSource = "SCHOOL_INTERNAL" | "VERIFIED_NATIONAL_REFERENCE";
export type ALevelGradingStatus = "DRAFT" | "ACTIVE" | "INACTIVE";

export type ALevelGradingBand = {
  id: string;
  grade: string;
  minScore: number | null;
  maxScore: number | null;
  points: number;
  descriptor: string;
  displayOrder: number;
};

export type ALevelGradingScheme = {
  id: string;
  name: string;
  programme: "A_LEVEL";
  subjectCategory: ALevelSubjectCategory;
  sourceType: ALevelGradingSource;
  sourceAuthority: string;
  sourceDocument: string;
  version: string;
  effectiveAcademicYear: string;
  effectiveTerm: string;
  status: ALevelGradingStatus;
  createdBy: string;
  approvedBy: string;
  createdAt: string;
  bands: ALevelGradingBand[];
};

const principalReference = [
  ["A", 6, "Excellent achievement"],
  ["B", 5, "Very good achievement"],
  ["C", 4, "Good achievement"],
  ["D", 3, "Satisfactory achievement"],
  ["E", 2, "Basic achievement"],
  ["O", 1, "Limited achievement / subsidiary-level performance"],
  ["F", 0, "Has not yet achieved the required standard"],
] as const;

export const initialALevelGradingSchemes: ALevelGradingScheme[] = [
  {
    id: "a-level-principal-school-draft-v1",
    name: "A-Level Principal School Internal",
    programme: "A_LEVEL",
    subjectCategory: "PRINCIPAL",
    sourceType: "SCHOOL_INTERNAL",
    sourceAuthority: "SOMA REPORT ENGINE Review Secondary School",
    sourceDocument: "",
    version: "1.0",
    effectiveAcademicYear: "2026",
    effectiveTerm: "Term II",
    status: "DRAFT",
    createdBy: "Omara William",
    approvedBy: "",
    createdAt: new Date().toISOString(),
    bands: principalReference.map(([grade, points, descriptor], index) => ({ id: `principal-${grade}`, grade, points, descriptor, minScore: null, maxScore: null, displayOrder: index + 1 })),
  },
];

export function validateALevelGradingScheme(scheme: ALevelGradingScheme, activating = false): string[] {
  const errors: string[] = [];
  if (!scheme.name.trim() || !scheme.version.trim() || !scheme.effectiveAcademicYear.trim() || !scheme.effectiveTerm.trim()) errors.push("Scheme name, version, academic year and term are required.");
  if (!scheme.bands.length) errors.push("Add at least one grading band.");
  const grades = scheme.bands.map((band) => band.grade.trim().toUpperCase());
  if (new Set(grades).size !== grades.length) errors.push("Each grade must be unique.");
  for (const band of scheme.bands) {
    if (!band.grade.trim() || !band.descriptor.trim()) errors.push("Every band requires a grade and achievement descriptor.");
    if (!Number.isFinite(band.points) || band.points < 0) errors.push(`${band.grade || "A band"} has an invalid point value.`);
    if (band.minScore !== null && (band.minScore < 0 || band.minScore > 100)) errors.push(`${band.grade} minimum must be between 0 and 100.`);
    if (band.maxScore !== null && (band.maxScore < 0 || band.maxScore > 100)) errors.push(`${band.grade} maximum must be between 0 and 100.`);
    if (band.minScore !== null && band.maxScore !== null && band.minScore > band.maxScore) errors.push(`${band.grade} minimum cannot exceed its maximum.`);
  }
  if (activating) {
    if (scheme.bands.some((band) => band.minScore === null || band.maxScore === null)) errors.push("Every band needs approved percentage boundaries before activation.");
    const sorted = [...scheme.bands].filter((band) => band.minScore !== null && band.maxScore !== null).sort((a, b) => (a.minScore ?? 0) - (b.minScore ?? 0));
    if (sorted.length && (sorted[0].minScore !== 0 || sorted.at(-1)?.maxScore !== 100)) errors.push("Active boundaries must cover the full 0–100 range.");
    for (let index = 1; index < sorted.length; index += 1) if ((sorted[index - 1].maxScore ?? 0) + 0.01 !== sorted[index].minScore) errors.push("Active boundaries must not overlap or contain gaps.");
    if (scheme.sourceType === "VERIFIED_NATIONAL_REFERENCE" && (!scheme.sourceAuthority.trim() || !scheme.sourceDocument.trim())) errors.push("A verified national reference requires its authority and source document.");
  }
  return [...new Set(errors)];
}

export function resolveALevelGrade(scheme: ALevelGradingScheme | undefined, average: number) {
  if (!scheme || scheme.status !== "ACTIVE") return null;
  const band = scheme.bands.find((item) => item.minScore !== null && item.maxScore !== null && average >= item.minScore && average <= item.maxScore);
  return band ? { grade: band.grade, points: band.points, descriptor: band.descriptor, schemeId: scheme.id, schemeVersion: scheme.version } : null;
}
