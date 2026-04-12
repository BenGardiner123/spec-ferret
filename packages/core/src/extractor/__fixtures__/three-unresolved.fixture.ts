import { z } from 'zod';

// Three separate unresolvable external references (not exported, no id)
const ext1 = { value: 'ext1', output: { a: z.string() } };
const ext2 = { value: 'ext2', output: { b: z.string() } };
const ext3 = { value: 'ext3', output: { c: z.string() } };

export const contractA = {
  value: 'Contract A',
  output: { x: z.string() },
  consumes: [ext1],
};

export const contractB = {
  value: 'Contract B',
  output: { y: z.string() },
  consumes: [ext2],
};

export const contractC = {
  value: 'Contract C',
  output: { zField: z.string() },
  consumes: [ext3],
};
