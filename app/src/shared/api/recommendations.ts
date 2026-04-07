import type { CourseCardSummary } from "../../modules/phase2-selection-hub/model/selection-hub.types";
import type { InitialInputSubmission } from "../../modules/phase1-initial-input/model/initial-input.types";
import type { SearchMode } from "../domain/course-flow.types";

import { buildMockRecommendations } from "../mock/mock-recommendations";

const API_BASE_URL = (
  globalThis as {
    process?: {
      env?: Record<string, string | undefined>;
    };
  }
).process?.env?.EXPO_PUBLIC_API_BASE_URL;

export interface RecommendationPreviewResult {
  mode: InitialInputSubmission["type"];
  courses: CourseCardSummary[];
  source: "api" | "mock";
}

function mapSubmissionToRequest(submission: InitialInputSubmission) {
  return {
    mode: submission.type === "quick-start" ? "quick-start" : "deep-dive",
    transport: submission.baseInfo.transport,
    city: submission.baseInfo.city,
    district: submission.baseInfo.district,
    scheduled_at: submission.baseInfo.scheduledAt,
    filters:
      submission.type === "deep-dive"
        ? {
            place_preference: submission.filters.placePreference ?? undefined,
            budget_limit: submission.filters.budgetLimit ?? undefined,
            movement_radius_meters:
              submission.filters.movementRadiusMeters ?? undefined,
            course_count: submission.filters.courseCount ?? undefined,
            date_genre: submission.filters.dateGenre ?? undefined,
          }
        : undefined,
  };
}

function mapApiCoursesToCards(courses: Array<{
  id: string;
  title: string;
  estimated_budget: number;
  total_duration_minutes: number;
  tags?: string[];
}>): CourseCardSummary[] {
  return courses.map((course) => ({
    courseId: course.id,
    title: course.title,
    estimatedBudget: course.estimated_budget,
    totalDurationMinutes: course.total_duration_minutes,
    tags: course.tags ?? [],
  }));
}

export async function requestRecommendationPreview(
  submission: InitialInputSubmission,
  searchMode?: SearchMode,
): Promise<RecommendationPreviewResult> {
  const requestMode =
    searchMode ??
    (submission.type === "quick-start" ? "quick-start" : "deep-dive");

  if (!API_BASE_URL) {
    return {
      mode: submission.type,
      courses: buildMockRecommendations(submission),
      source: "mock",
    };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/recommendations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...mapSubmissionToRequest(submission),
        mode: requestMode,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to request recommendations: ${response.status}`);
    }

    const payload = (await response.json()) as {
      courses: Array<{
        id: string;
        title: string;
        estimated_budget: number;
        total_duration_minutes: number;
        tags?: string[];
      }>;
    };

    return {
      mode: submission.type,
      courses: mapApiCoursesToCards(payload.courses),
      source: "api",
    };
  } catch {
    return {
      mode: submission.type,
      courses: buildMockRecommendations(submission),
      source: "mock",
    };
  }
}
