import { z } from 'zod';

export const pendingContract = {
  id: 'pendingContract',
  value: 'Pending contract — should map to pending',
  output: {
    id: z.string(),
  },
};
