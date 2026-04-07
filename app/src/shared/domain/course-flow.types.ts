import type { SupportedCity } from "../config/region-scope";

export type FlowPhase =
  | "phase1-initial-input"
  | "phase2-selection-hub"
  | "phase3-customizing"
  | "phase4-execution";

export type TransportMethod =
  | "walk"
  | "public-transport"
  | "car"
  | "mixed"
  | "unselected";

export type SearchMode =
  | "quick-start"
  | "deep-dive"
  | "simple-refresh"
  | "deep-dive-research";

export type SatisfactionResult = "satisfied" | "unsatisfied" | "undecided";

export interface BaseInfoInput {
  transport: TransportMethod;
  city: SupportedCity | null;
  district: string | null;
  scheduledAt: string | null;
}

export interface DeepDiveFilters {
  placePreference: "direct" | "random" | "food-type" | null;
  budgetLimit: number | null;
  movementRadiusMeters: number | null;
  courseCount: number | null;
  dateGenre: string | null;
}

export interface SelectedCourseRef {
  courseId: string;
  title: string;
}

export interface CustomizationDraft {
  courseId: string;
  replacedPlaceIds: string[];
  reorderedPlaceIds: string[];
  editedFields: Array<"place" | "time" | "activity-type">;
}

export interface CourseFlowState {
  phase: FlowPhase;
  baseInfo: BaseInfoInput;
  deepDive: DeepDiveFilters;
  searchMode: SearchMode | null;
  selectedCourse: SelectedCourseRef | null;
  customizationDraft: CustomizationDraft | null;
  satisfaction: SatisfactionResult;
}
