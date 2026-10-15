export const aLevelCombinations = [
    { code: "PCM", name: "Physics, Chemistry and Mathematics", principalSubjectCodes: ["PHY", "CHE", "MAT"], subsidiarySubjectCodes: ["ICT"], compulsorySubjectCodes: ["GP"], status: "ACTIVE" },
    { code: "PCB", name: "Physics, Chemistry and Biology", principalSubjectCodes: ["PHY", "CHE", "BIO"], subsidiarySubjectCodes: ["SMAT"], compulsorySubjectCodes: ["GP"], status: "ACTIVE" },
    { code: "HEG", name: "History, Economics and Geography", principalSubjectCodes: ["HIS", "ECO", "GEO"], subsidiarySubjectCodes: ["ICT"], compulsorySubjectCodes: ["GP"], status: "ACTIVE" },
    { code: "MEG", name: "Mathematics, Economics and Geography", principalSubjectCodes: ["MAT", "ECO", "GEO"], subsidiarySubjectCodes: ["ICT"], compulsorySubjectCodes: ["GP"], status: "ACTIVE" },
];
export const aLevelSubjectNames = {
    PHY: "Physics", CHE: "Chemistry", MAT: "Mathematics", BIO: "Biology",
    HIS: "History", ECO: "Economics", GEO: "Geography", GP: "General Paper", SMAT: "Subsidiary Mathematics", ICT: "Information and Communication Technology",
};
export function getCombination(code) {
    return aLevelCombinations.find((item) => item.code === code && item.status === "ACTIVE");
}
export function resolveCombinationSubjects(code) {
    const combination = getCombination(code);
    if (!combination)
        return [];
    return [
        ...combination.principalSubjectCodes.map((subjectCode) => ({ subjectCode, subjectName: aLevelSubjectNames[subjectCode], role: "PRINCIPAL" })),
        ...combination.subsidiarySubjectCodes.map((subjectCode) => ({ subjectCode, subjectName: aLevelSubjectNames[subjectCode], role: "SUBSIDIARY" })),
        ...combination.compulsorySubjectCodes.map((subjectCode) => ({ subjectCode, subjectName: aLevelSubjectNames[subjectCode], role: subjectCode === "GP" ? "GENERAL_PAPER" : "COMPULSORY" })),
    ];
}
