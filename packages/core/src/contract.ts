import { z } from 'zod';

export interface Contract<
  T extends Record<string, z.ZodTypeAny> = Record<string, z.ZodTypeAny>,
> {
  id?: string;
  value: string;
  output: T;
  schema?: z.ZodObject<T>;
  invariants?: Array<(r: z.infer<z.ZodObject<T>>) => boolean>;
  // ContractRef avoids invariance errors — dependency arrays don't need invariant type safety
  consumes?: ContractRef[];
  forbids?: string[];
  status?: 'complete' | 'active' | 'pending';
  closedBy?: string;
  closedWhen?: string;
  dependsOn?: ContractRef[];
}

// Non-generic reference type for dependency arrays.
// Uses (r: any) => boolean so contracts with different output shapes are assignable without casts.
export type ContractRef = Omit<Contract<any>, 'invariants' | 'schema'> & {
  invariants?: Array<(r: any) => boolean>;
  schema?: z.ZodObject<any>;
};

export function defineContract<T extends Record<string, z.ZodTypeAny>>(
  contract: Contract<T>,
): Contract<T> & { schema: z.ZodObject<T> } {
  if ('id' in contract && contract.id !== undefined && contract.id.trim() === '') {
    throw new Error('defineContract: id must be a non-empty string if provided');
  }
  return Object.assign(contract, { schema: z.object(contract.output) });
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
