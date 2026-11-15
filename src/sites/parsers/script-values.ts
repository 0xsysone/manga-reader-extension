/** Reads values embedded in inline `<script>` texts without running them. */

const OPENING_BRACKET = /[[{]/;
const CLOSING_BRACKET: Readonly<Record<string, string>> = { '{': '}', '[': ']' };

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Index just past the bracket that closes the one at `open`, ignoring brackets inside JSON strings; `-1` if unbalanced. */
function matchingBracketEnd(text: string, open: number): number {
  const opener = text.charAt(open);
  const closer = CLOSING_BRACKET[opener];
  let depth = 0;
  let inString = false;
  for (let index = open; index < text.length; index++) {
    const char = text.charAt(index);
    if (inString) {
      if (char === '\\') index++;
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
    } else if (char === opener) {
      depth++;
    } else if (char === closer) {
      depth--;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}

/**
 * The JSON object or array that follows `marker` in a script text (strings containing brackets are handled).
 * `null` when the marker is missing, no object or array follows, or the JSON is invalid.
 */
export function extractJsonAfter(text: string | null | undefined, marker: string): unknown {
  if (text == null) return null;
  const markerIndex = text.indexOf(marker);
  if (markerIndex === -1) return null;
  const from = markerIndex + marker.length;
  const offset = text.slice(from).search(OPENING_BRACKET);
  if (offset === -1) return null;
  const open = from + offset;
  const end = matchingBracketEnd(text, open);
  if (end === -1) return null;
  try {
    return JSON.parse(text.slice(open, end)) as unknown;
  } catch {
    return null;
  }
}

/** Value of a string variable declared as `var|let|const name = "..."` in a script; `null` when absent or invalid. */
export function parseJsString(text: string | null | undefined, name: string): string | null {
  if (text == null) return null;
  const declaration = new RegExp(
    `(?:var|let|const)\\s+${escapeRegExp(name)}\\s*=\\s*("(?:[^"\\\\]|\\\\.)*")`,
  );
  const literal = declaration.exec(text)?.[1];
  if (literal === undefined) return null;
  try {
    const value: unknown = JSON.parse(literal);
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}
