export type SubjectProgramme = "O_LEVEL" | "A_LEVEL";
export type SubjectLevel = "ORDINARY" | "PRINCIPAL" | "SUBSIDIARY" | "GENERAL_PAPER" | "OTHER" | null;
export type VerificationStatus = "VERIFIED" | "PENDING_VERIFICATION" | "RETIRED";

export type SystemSubjectPaper = {
  id: string; paperCode: string | null; paperNumber: string | null; paperName: string;
  componentType: "THEORY" | "PRACTICAL" | "ORAL" | "AURAL" | "COURSEWORK" | "PROJECT" | "STUDIO" | "PERFORMANCE" | "ICT_PRACTICAL" | "OTHER";
  maximumMark: number | null; displayOrder: number; required: boolean;
  curriculumVersion: string | null; examinationYear: number | null; verificationStatus: VerificationStatus;
};

export type SystemSubject = {
  id: string; programme: SubjectProgramme; subjectCode: string | null; name: string; shortName: string;
  department: string; category: string; subjectLevel: SubjectLevel; curriculumVersion: string | null;
  examBody: string | null; examinable: boolean; active: boolean; verificationStatus: VerificationStatus;
  papers: SystemSubjectPaper[];
};

export type Subject = {
  id: string; systemSubjectId: string | null; source: "SYSTEM_CATALOGUE" | "SCHOOL_DEFINED";
  code: string; name: string; department: string; programme: "O-Level" | "A-Level";
  classNames: string[]; compulsory: boolean; status: "Active" | "Inactive"; verificationStatus: VerificationStatus;
};

function item(id: string, programme: SubjectProgramme, name: string, shortName: string, department: string, subjectLevel: SubjectLevel = programme === "O_LEVEL" ? "ORDINARY" : "PRINCIPAL"): SystemSubject {
  return { id, programme, subjectCode: null, name, shortName, department, category: department, subjectLevel, curriculumVersion: null, examBody: null, examinable: true, active: true, verificationStatus: "PENDING_VERIFICATION", papers: [] };
}

// Candidate names come from the supplied requirements. Codes, official status
// and paper structures deliberately remain pending until verified sources exist.
const baseSystemSubjectCatalogue: SystemSubject[] = [
  { ...item("sys-ol-mathematics", "O_LEVEL", "Mathematics", "Mathematics", "Mathematics"), subjectCode: "456", examBody: "UNEB", verificationStatus: "VERIFIED" },
  { ...item("sys-ol-english", "O_LEVEL", "English Language", "English", "Languages"), subjectCode: "112", examBody: "UNEB", verificationStatus: "VERIFIED" },
  { ...item("sys-ol-physics", "O_LEVEL", "Physics", "Physics", "Sciences"), subjectCode: "535", examBody: "UNEB", verificationStatus: "VERIFIED" },
  { ...item("sys-ol-chemistry", "O_LEVEL", "Chemistry", "Chemistry", "Sciences"), subjectCode: "545", examBody: "UNEB", verificationStatus: "VERIFIED" },
  { ...item("sys-ol-biology", "O_LEVEL", "Biology", "Biology", "Sciences"), subjectCode: "553", examBody: "UNEB", verificationStatus: "VERIFIED" },
  { ...item("sys-ol-geography", "O_LEVEL", "Geography", "Geography", "Humanities"), subjectCode: "273", examBody: "UNEB", verificationStatus: "VERIFIED" },
  { ...item("sys-ol-history", "O_LEVEL", "History & Political Education", "History", "Humanities"), subjectCode: "241", examBody: "UNEB", verificationStatus: "VERIFIED" },
  item("sys-ol-ict", "O_LEVEL", "Information and Communication Technology", "ICT", "Technology"),
  item("sys-ol-agriculture", "O_LEVEL", "Agriculture", "Agriculture", "Vocational"),
  item("sys-ol-entrepreneurship", "O_LEVEL", "Entrepreneurship Education", "Entrepreneurship", "Vocational"),
  item("sys-ol-kiswahili", "O_LEVEL", "Kiswahili", "Kiswahili", "Languages"),
  { ...item("sys-al-general-paper", "A_LEVEL", "General Paper", "General Paper", "General", "GENERAL_PAPER"), subjectCode: "S101", examBody: "UNEB", verificationStatus: "VERIFIED" },
  item("sys-al-mathematics", "A_LEVEL", "Mathematics", "Mathematics", "Mathematics"),
  item("sys-al-physics", "A_LEVEL", "Physics", "Physics", "Sciences"),
  item("sys-al-chemistry", "A_LEVEL", "Chemistry", "Chemistry", "Sciences"),
  item("sys-al-biology", "A_LEVEL", "Biology", "Biology", "Sciences"),
  item("sys-al-history", "A_LEVEL", "History", "History", "Humanities"),
  item("sys-al-geography", "A_LEVEL", "Geography", "Geography", "Humanities"),
  item("sys-al-economics", "A_LEVEL", "Economics", "Economics", "Humanities"),
  item("sys-al-literature", "A_LEVEL", "Literature in English", "Literature", "Languages"),
  item("sys-al-agriculture", "A_LEVEL", "Agriculture", "Agriculture", "Vocational"),
  item("sys-al-religious", "A_LEVEL", "Religious Education", "Religious Education", "Humanities"),
  item("sys-al-subsidiary-mathematics", "A_LEVEL", "Subsidiary Mathematics", "Subsidiary Mathematics", "Mathematics", "SUBSIDIARY"),
  item("sys-al-ict", "A_LEVEL", "Subsidiary ICT", "Subsidiary ICT", "Technology", "SUBSIDIARY"),
];

const missingOLSubjects: Array<[string,string,string]> = [
  ["general-science","General Science","Sciences"],["physical-education","Physical Education","Physical Education"],
  ["cre","Christian Religious Education","Humanities"],["ire","Islamic Religious Education","Humanities"],
  ["french","French","Languages"],["german","German","Languages"],["latin","Latin","Languages"],["arabic","Arabic","Languages"],["chinese","Chinese","Languages"],
  ["literature","Literature in English","Languages"],["art-design","Art and Design","Creative Arts"],["performing-arts","Performing Arts","Creative Arts"],
  ["technology-design","Technology and Design","Technology"],["nutrition-food-technology","Nutrition and Food Technology","Vocational"],
  ["ateso","Ateso","Languages"],["dhopadhola","Dhopadhola","Languages"],["leb-acoli","Leb Acoli","Languages"],["leblango","Leblango","Languages"],
  ["luganda","Luganda","Languages"],["lugbarati","Lugbarati","Languages"],["lumasaaba","Lumasaaba","Languages"],["lusoga","Lusoga","Languages"],
  ["runyoro-rutooro","Runyoro-Rutooro","Languages"],["runyankore-rukiga","Runyankore-Rukiga","Languages"],
];
const missingALPrincipalSubjects: Array<[string,string,string]> = [
  ["agriculture","Agriculture","Vocational"],["arabic","Arabic","Languages"],["art-design","Art and Design","Creative Arts"],["chinese","Chinese","Languages"],
  ["cre","Christian Religious Education","Humanities"],["clothing-textile","Clothing and Textile","Vocational"],["entrepreneurship","Entrepreneurship Education","Vocational"],
  ["foods-nutrition","Foods and Nutrition","Vocational"],["french","French","Languages"],["german","German","Languages"],["ire","Islamic Religious Education","Humanities"],
  ["kiswahili","Kiswahili","Languages"],["latin","Latin","Languages"],["metal-work","Metal Work","Technology"],["music","Music","Creative Arts"],
  ["technical-drawing","Technical Drawing","Technology"],["wood-work","Wood Work","Technology"],["ateso","Ateso","Languages"],["dhopadhola","Dhopadhola","Languages"],
  ["leb-acoli","Leb Acoli","Languages"],["leblango","Leblango","Languages"],["luganda","Luganda","Languages"],["lugbarati","Lugbarati","Languages"],
  ["lumasaaba","Lumasaaba","Languages"],["lusoga","Lusoga","Languages"],["runyoro-rutooro","Runyoro-Rutooro","Languages"],
  ["runyankore-rukiga","Runyankore-Rukiga","Languages"],["physical-education","Physical Education","Physical Education"],["principal-ict","Principal ICT","Technology"],
];
export const systemSubjectCatalogue: SystemSubject[] = [
  ...baseSystemSubjectCatalogue,
  ...missingOLSubjects.map(([slug,name,department]) => item(`sys-ol-${slug}`,"O_LEVEL",name,name,department,"ORDINARY")),
  ...missingALPrincipalSubjects.map(([slug,name,department]) => item(`sys-al-${slug}`,"A_LEVEL",name,name,department,"PRINCIPAL")),
];

export const subjects: Subject[] = [];
