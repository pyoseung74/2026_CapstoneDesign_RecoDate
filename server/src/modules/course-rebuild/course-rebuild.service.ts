export interface CourseRebuildRequest {
  courseId: string;
  replacedPlaceIds: string[];
  reorderedPlaceIds: string[];
  editedFields: Array<"place" | "time" | "activity-type">;
}

export interface CourseRebuildResult {
  overwrittenCourseId: string;
  recalculated: true;
}

export class CourseRebuildService {
  rebuild(request: CourseRebuildRequest): CourseRebuildResult {
    void request;
    throw new Error("Course rebuild is not implemented yet.");
  }
}
