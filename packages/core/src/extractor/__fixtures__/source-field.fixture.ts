import { z } from 'zod';
import { defineContract } from '../../contract.js';

export const apiGetKeywords = defineContract({
  id: 'api.getKeywords',
  value: 'Keywords endpoint',
  output: {
    keywords: z.array(z.string()),
  },
  source: { file: 'src/routes/keywords.ts', symbol: 'KeywordsResponse' },
});
