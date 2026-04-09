/**
 * Parses a raw --perf-budget-ms option value.
 *
 * Returns:
 *   - undefined  — no value was supplied (budget disabled)
 *   - null       — value was supplied but is not a positive finite number (invalid input)
 *   - number     — a valid positive integer budget in milliseconds
 */
export function parsePositiveMsBudget(raw: unknown): number | undefined | null {
  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.round(parsed);
}
