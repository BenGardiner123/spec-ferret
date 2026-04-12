import { z } from 'zod';

export const baseContract = {
  value: 'Base contract',
  output: { token: z.string() },
};

export const dependentContract = {
  value: 'Dependent contract that consumes baseContract',
  output: { result: z.string() },
  consumes: [baseContract],
};
