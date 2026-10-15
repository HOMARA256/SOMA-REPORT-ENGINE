export type Assessment = {
  id: string;
  name: string;
  programme: "O-Level" | "A-Level";
  term: string;
  componentCount: number;
  maximumMark: number;
  status: "Draft" | "Open" | "Closed";
};

export const assessments: Assessment[] = [
  { id: "assessment-001", name: "Term II Continuous Assessment", programme: "O-Level", term: "Term II", componentCount: 2, maximumMark: 20, status: "Open" },
  { id: "assessment-002", name: "Term II End of Term Examination", programme: "O-Level", term: "Term II", componentCount: 1, maximumMark: 80, status: "Open" },
  { id: "assessment-003", name: "Term II Coursework", programme: "A-Level", term: "Term II", componentCount: 2, maximumMark: 30, status: "Open" },
  { id: "assessment-004", name: "Term II Examination", programme: "A-Level", term: "Term II", componentCount: 1, maximumMark: 70, status: "Draft" },
];
