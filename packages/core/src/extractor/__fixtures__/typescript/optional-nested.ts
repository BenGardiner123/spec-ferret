export interface SearchResult {
  id: string;
  metadata?: {
    tags?: string[];
    score: number;
  };
}
