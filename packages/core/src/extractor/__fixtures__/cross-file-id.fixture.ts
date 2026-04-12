import { z } from 'zod';
import { externalWithId } from './external-with-id.fixture.js';

// Consumes an external contract that has an explicit id — resolves via c.id
export const myContract = {
  value: 'Contract consuming known external',
  output: { result: z.string() },
  consumes: [externalWithId],
};
