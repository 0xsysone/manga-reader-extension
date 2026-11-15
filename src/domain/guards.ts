/** Plain object with string keys, as found in parsed JSON. */
export type JsonRecord = Record<string, unknown>;

/** `true` for a non-null object (arrays included), so its properties can be read safely. */
export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}

/** `value` when it is a non-empty string, `null` otherwise. */
export function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}
