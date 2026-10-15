export type AlevelMarkState = "PRESENT" | "MISSING" | "ABSENT" | "EXEMPT";
export type SelectedPaperMark = { paperId: string; required: boolean; state: AlevelMarkState; mark: number | null };
export type AlevelScoreResult = { status: "COMPLETE" | "INCOMPLETE" | "NOT_CONFIGURED"; score: number | null; blockingStates: AlevelMarkState[] };

/**
 * Domain rule mirrored by the database result function. Only selected required
 * papers are supplied. Marks are averaged numerically before any grade lookup.
 */
export function calculateSelectedPaperResult(papers: SelectedPaperMark[]): AlevelScoreResult {
  const required = papers.filter(paper => paper.required);
  if (!required.length) return { status: "NOT_CONFIGURED", score: null, blockingStates: [] };
  const blocking = required.filter(paper => paper.state !== "PRESENT" || paper.mark === null);
  if (blocking.length) return { status: "INCOMPLETE", score: null, blockingStates: [...new Set(blocking.map(paper => paper.state))] };
  for (const paper of required) if (paper.mark! < 0 || paper.mark! > 100) throw new RangeError("PRESENT marks must be between 0 and 100.");
  const average = required.reduce((total, paper) => total + paper.mark!, 0) / required.length;
  return { status: "COMPLETE", score: Math.round(average * 10) / 10, blockingStates: [] };
}

