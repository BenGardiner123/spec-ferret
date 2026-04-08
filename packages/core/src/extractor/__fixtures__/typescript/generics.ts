export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  nextCursor?: string;
}
