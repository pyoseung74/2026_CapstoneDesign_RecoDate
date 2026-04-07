export interface LiveReplanningInput {
  courseId: string;
  currentLatitude: number;
  currentLongitude: number;
  reason: string;
}

export class LiveReplanningService {
  replan(input: LiveReplanningInput): string {
    void input;
    throw new Error("Live replanning is not implemented yet.");
  }
}
