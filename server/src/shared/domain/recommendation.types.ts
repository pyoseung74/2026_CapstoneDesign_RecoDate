import type { SupportedCity } from "../config/mvp-scope";

export type TransportMethod =
  | "walk"
  | "public-transport"
  | "car"
  | "mixed"
  | "unselected";

export type RecommendationMode =
  | "quick-start"
  | "deep-dive"
  | "simple-refresh"
  | "deep-dive-research";

export interface RecommendationRequest {
  mode: RecommendationMode;
  transport: TransportMethod;
  city: SupportedCity | null;
  district: string | null;
  scheduledAt: string | null;
  filters?: {
    placePreference?: "direct" | "random" | "food-type";
    budgetLimit?: number;
    movementRadiusMeters?: number;
    courseCount?: number;
    dateGenre?: string;
  };
}

export interface RecommendedCourse {
  id: string;
  title: string;
  estimatedBudget: number;
  totalDurationMinutes: number;
  placeIds: string[];
}
