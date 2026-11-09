// The delivery promise the public site states, kept in one place so the page and the worker can't disagree.
// "8 tries over 24 h": the first try at once, then seven retries after these waits.

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

export const RETRY_WAITS_MS: readonly number[] = [
  30 * SECOND,
  2 * MINUTE,
  10 * MINUTE,
  30 * MINUTE,
  2 * HOUR,
  6 * HOUR,
  15 * HOUR,
];

export const MAX_TRIES = RETRY_WAITS_MS.length + 1;

/** Wait before try number `tryNumber` (1-based); try 1 goes at once. Null once every try is spent. */
export function waitBeforeTry(tryNumber: number): number | null {
  if (!Number.isInteger(tryNumber) || tryNumber < 1) throw new RangeError(`try number must be 1 or more: ${tryNumber}`);
  if (tryNumber === 1) return 0;
  return RETRY_WAITS_MS[tryNumber - 2] ?? null;
}
