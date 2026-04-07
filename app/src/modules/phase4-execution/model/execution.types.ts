export interface ExecutionSession {
  courseId: string;
  isSaved: boolean;
  isShared: boolean;
  liveNavigationStarted: boolean;
}

export interface LiveReplanningRequest {
  courseId: string;
  currentLatitude: number;
  currentLongitude: number;
  reason: string;
}
