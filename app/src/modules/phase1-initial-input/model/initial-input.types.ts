import type { BaseInfoInput, DeepDiveFilters } from "../../../shared/domain/course-flow.types";

export interface QuickStartSubmission {
  type: "quick-start";
  baseInfo: BaseInfoInput;
}

export interface DeepDiveSubmission {
  type: "deep-dive";
  baseInfo: BaseInfoInput;
  filters: DeepDiveFilters;
}

export type InitialInputSubmission = QuickStartSubmission | DeepDiveSubmission;
