import { z } from 'zod';

export interface Contract<
  T extends Record<string, z.ZodTypeAny> = Record<string, z.ZodTypeAny>,
> {
  id?: string;
  value: string;
  output: T;
  invariants?: Array<(r: z.infer<z.ZodObject<T>>) => boolean>;
  consumes?: Contract[];
  forbids?: string[];
  status?: 'complete' | 'active' | 'pending';
  closedBy?: string;
  closedWhen?: string;
  dependsOn?: Contract[];
}

export function defineContract<T extends Record<string, z.ZodTypeAny>>(
  contract: Contract<T>,
): Contract<T> {
  if ('id' in contract && contract.id !== undefined && contract.id.trim() === '') {
    throw new Error('defineContract: id must be a non-empty string if provided');
  }
  return contract;
}

export function isContract(value: unknown): value is Contract {
  return (
    typeof value === 'object' &&
    value !== null &&
    'value' in value &&
    typeof (value as Record<string, unknown>).value === 'string' &&
    'output' in value &&
    typeof (value as Record<string, unknown>).output === 'object' &&
    (value as Record<string, unknown>).output !== null &&
    !Array.isArray((value as Record<string, unknown>).output)
  );
}
