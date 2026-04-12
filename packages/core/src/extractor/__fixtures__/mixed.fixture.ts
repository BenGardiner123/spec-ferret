import { z } from 'zod';

export const validContract = {
  value: 'valid',
  output: { name: z.string() },
};

export const anotherValid = {
  value: 'another valid',
  output: { count: z.number() },
};

// These should be skipped by isContract
export const notAContract = 42;
export const alsoNotAContract = 'just a string';
export const missingOutput = { value: 'oops' };
export const missingValue = { output: { x: z.string() } };
