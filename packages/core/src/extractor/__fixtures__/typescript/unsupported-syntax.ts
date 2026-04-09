export type RouteMap<T extends string> = {
  [K in T]: {
    method: 'GET' | 'POST';
    secured?: boolean;
  };
};
