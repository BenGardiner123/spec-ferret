import { z } from 'zod';

// Export name uses underscores; .id uses dot notation — the standard convention.
export const tables_dataSource = {
  id: 'tables.dataSource',
  value: 'tables data source',
  output: { data: z.string() },
};

export const tables_ingestionRun = {
  id: 'tables.ingestionRun',
  value: 'tables ingestion run',
  output: { runId: z.string() },
  consumes: [tables_dataSource],
};
