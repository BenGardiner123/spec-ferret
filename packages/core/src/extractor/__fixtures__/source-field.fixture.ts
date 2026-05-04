import { z } from 'zod';

export const apiGetKeywords = {
  id: 'api.getKeywords',
  value: 'Keywords endpoint',
  output: {
    keywords: z.array(z.string()),
  },
  source: { file: 'src/routes/keywords.ts', symbol: 'KeywordsResponse' },
};
