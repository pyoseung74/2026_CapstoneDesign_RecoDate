import type {
  RecommendationRequest,
  RecommendedCourse,
} from "../../shared/domain/recommendation.types";

export class RecommendationEngineService {
  recommend(request: RecommendationRequest): RecommendedCourse[] {
    void request;
    throw new Error("Recommendation engine is not implemented yet.");
  }
}
