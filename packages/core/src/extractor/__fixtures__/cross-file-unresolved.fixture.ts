import { z } from 'zod';
import { externalNoId } from './external-no-id.fixture.js';

// Consumes an external contract with no id — triggers exactly one warning
export const myContract = {
  value: 'Contract consuming unresolvable external',
  output: { result: z.string() },
  consumes: [externalNoId],
};
