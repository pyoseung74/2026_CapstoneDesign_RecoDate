import type { CourseFlowState } from "../domain/course-flow.types";

export function createInitialCourseFlowState(): CourseFlowState {
  return {
    phase: "phase1-initial-input",
    baseInfo: {
      transport: "unselected",
      city: null,
      district: null,
      scheduledAt: null,
    },
    deepDive: {
      placePreference: null,
      budgetLimit: null,
      movementRadiusMeters: null,
      courseCount: null,
      dateGenre: null,
    },
    searchMode: null,
    selectedCourse: null,
    customizationDraft: null,
    satisfaction: "undecided",
  };
}
