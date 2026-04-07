import type { CustomizationDraft, SatisfactionResult } from "../../../shared/domain/course-flow.types";

export interface CustomizationResult {
  overwrittenCourseId: string;
  recalculated: true;
  draft: CustomizationDraft;
}

export interface PostEditDecision {
  satisfaction: SatisfactionResult;
  nextStep: "continue-editing" | "re-search" | "phase4-execution";
}
