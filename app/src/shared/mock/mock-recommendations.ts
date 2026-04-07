import type { InitialInputSubmission } from "../../modules/phase1-initial-input/model/initial-input.types";
import type { CourseCardSummary } from "../../modules/phase2-selection-hub/model/selection-hub.types";

const BASE_COURSES: CourseCardSummary[] = [
  {
    courseId: "gangneung-romantic-1",
    title: "\uac15\ub989 \ubc14\ub2e4 \uc0b0\ucc45 + \uce74\ud398 \ucf54\uc2a4",
    estimatedBudget: 42000,
    totalDurationMinutes: 210,
    tags: ["gangneung", "sea", "cafe"],
  },
  {
    courseId: "gangneung-food-1",
    title: "\ucd08\ub2f9 \uc21c\ub450\ubd80 + \uc548\ubaa9 \ucee4\ud53c \ucf54\uc2a4",
    estimatedBudget: 38000,
    totalDurationMinutes: 180,
    tags: ["food", "cafe", "gangneung"],
  },
  {
    courseId: "gangneung-night-1",
    title: "\uacbd\ud3ec \uc57c\uac04 \ub4dc\ub77c\uc774\ube0c \ucf54\uc2a4",
    estimatedBudget: 56000,
    totalDurationMinutes: 240,
    tags: ["night", "drive", "gangneung"],
  },
];

export function buildMockRecommendations(
  submission: InitialInputSubmission,
): CourseCardSummary[] {
  const cityLabel =
    submission.baseInfo.city === "gangneung-si"
      ? "\uac15\ub989\uc2dc"
      : "\uac15\ub989 MVP";

  const deepDiveTag =
    submission.type === "deep-dive" && submission.filters.dateGenre
      ? submission.filters.dateGenre
      : submission.type;

  return BASE_COURSES.map((course, index) => ({
    ...course,
    courseId: `${course.courseId}-${submission.type}-${index + 1}`,
    title: `${cityLabel} · ${course.title}`,
    tags: [...course.tags, deepDiveTag],
  }));
}
