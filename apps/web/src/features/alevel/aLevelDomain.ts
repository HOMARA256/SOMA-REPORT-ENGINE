export type ALevelSubjectRole = "PRINCIPAL" | "SUBSIDIARY" | "GENERAL_PAPER" | "COMPULSORY";

export type ALevelCombination = {
  code: string;
  name: string;
  principalSubjectCodes: string[];
  subsidiarySubjectCodes: string[];
  compulsorySubjectCodes: string[];
  status: "ACTIVE" | "INACTIVE";
};

export const aLevelCombinations: ALevelCombination[] = [
  { code: "PCM", name: "Physics, Chemistry and Mathematics", principalSubjectCodes: ["PHY", "CHE", "MAT"], subsidiarySubjectCodes: ["ICT"], compulsorySubjectCodes: ["GP"], status: "ACTIVE" },
  { code: "PCB", name: "Physics, Chemistry and Biology", principalSubjectCodes: ["PHY", "CHE", "BIO"], subsidiarySubjectCodes: ["SMAT"], compulsorySubjectCodes: ["GP"], status: "ACTIVE" },
  { code: "HEG", name: "History, Economics and Geography", principalSubjectCodes: ["HIS", "ECO", "GEO"], subsidiarySubjectCodes: ["ICT"], compulsorySubjectCodes: ["GP"], status: "ACTIVE" },
  { code: "MEG", name: "Mathematics, Economics and Geography", principalSubjectCodes: ["MAT", "ECO", "GEO"], subsidiarySubjectCodes: ["ICT"], compulsorySubjectCodes: ["GP"], status: "ACTIVE" },
];

export const aLevelSubjectNames: Record<string, string> = {
  PHY: "Physics", CHE: "Chemistry", MAT: "Mathematics", BIO: "Biology",
  HIS: "History", ECO: "Economics", GEO: "Geography", GP: "General Paper", SMAT: "Subsidiary Mathematics", ICT: "Information and Communication Technology",
};

export function getCombination(code?: string) {
  return aLevelCombinations.find((item) => item.code === code && item.status === "ACTIVE");
}

export function resolveCombinationSubjects(code?: string) {
  const combination = getCombination(code);
  if (!combination) return [];
  return [
    ...combination.principalSubjectCodes.map((subjectCode) => ({ subjectCode, subjectName: aLevelSubjectNames[subjectCode], role: "PRINCIPAL" as const })),
    ...combination.subsidiarySubjectCodes.map((subjectCode) => ({ subjectCode, subjectName: aLevelSubjectNames[subjectCode], role: "SUBSIDIARY" as const })),
    ...combination.compulsorySubjectCodes.map((subjectCode) => ({ subjectCode, subjectName: aLevelSubjectNames[subjectCode], role: subjectCode === "GP" ? "GENERAL_PAPER" as const : "COMPULSORY" as const })),
  ];
}
