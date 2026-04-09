export const CONTRACT_TYPES = ['api', 'table', 'type', 'event', 'flow', 'config'] as const;

export type ContractType = (typeof CONTRACT_TYPES)[number];

export function isContractType(value: unknown): value is ContractType {
  return typeof value === 'string' && (CONTRACT_TYPES as readonly string[]).includes(value);
}

export function formatAllowedContractTypes(): string {
  return CONTRACT_TYPES.join(', ');
}
