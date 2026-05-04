import { z } from 'zod';

export const activeContract = {
  id: 'activeContract',
  value: 'Active contract — should map to stable',
  status: 'active' as const,
  output: {
    id: z.string(),
  },
};
