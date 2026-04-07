export interface PlaceSearchQuery {
  city: string | null;
  district: string | null;
  keyword?: string;
  category?: string;
}

export class PlaceSearchService {
  search(query: PlaceSearchQuery): string[] {
    void query;
    throw new Error("Place search is not implemented yet.");
  }
}
