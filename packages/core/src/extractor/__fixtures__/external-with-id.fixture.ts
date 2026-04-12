import { z } from 'zod';

// External contract with an explicit id — cross-file refs resolve via c.id
export const externalWithId = {
  value: 'External contract with explicit id',
  output: { data: z.string() },
  id: 'external.known.id',
};
