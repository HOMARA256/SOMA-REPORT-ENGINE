export type MissingMarkRecord = {
  id: string;
  learner: string;
  lin: string;
  className: string;
  subject: string;
  component: string;
  teacher: string;
  dueState: "Overdue" | "Pending";
};

export const missingMarkRecords: MissingMarkRecord[] = [];
