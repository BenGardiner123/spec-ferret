import { z } from 'zod';

export const userContract = {
  value: 'User shape contract',
  output: {
    id: z.string().uuid(),
    name: z.string(),
    email: z.string().email(),
  },
};
