import { z } from 'zod';

// External contract with no id — cross-file refs to this will be unresolvable
export const externalNoId = {
  value: 'External contract without id',
  output: { data: z.string() },
};
