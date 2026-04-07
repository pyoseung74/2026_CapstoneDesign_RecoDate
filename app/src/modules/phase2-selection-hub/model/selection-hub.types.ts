import type { SearchMode, SelectedCourseRef } from "../../../shared/domain/course-flow.types";

export interface CourseCardSummary {
  courseId: string;
  title: string;
  totalDurationMinutes: number;
  estimatedBudget: number;
  tags: string[];
}

export interface SelectionHubState {
  cards: CourseCardSummary[];
  lastSearchMode: SearchMode | null;
  selectedCourse: SelectedCourseRef | null;
}

export type SelectionHubAction =
  | { type: "simple-refresh" }
  | { type: "open-deep-dive" }
  | { type: "select-course"; payload: SelectedCourseRef };
