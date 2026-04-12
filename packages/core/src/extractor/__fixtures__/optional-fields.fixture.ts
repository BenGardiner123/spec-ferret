import { z } from 'zod';

export const optionalFieldsContract = {
  value: 'Contract with optional fields',
  output: {
    required_field: z.string(),
    optional_field: z.string().optional(),
    optional_number: z.number().optional(),
  },
};
