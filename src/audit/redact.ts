/**
 * Best-effort scrubbing for anything that reaches the audit log. This is a
 * safety net, not the primary control: the runtime already avoids writing
 * payloads, inputs and model output to the log.
 */
const RULES: { pattern: RegExp; replacement: string }[] = [
  {
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replacement: '[REDACTED_PRIVATE_KEY]',
  },
  { pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, replacement: 'Bearer [REDACTED]' },
  { pattern: /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}\b/g, replacement: '[REDACTED_KEY]' },
  { pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/g, replacement: '[REDACTED_KEY]' },
  { pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, replacement: '[REDACTED_KEY]' },
  {
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    replacement: '[REDACTED_JWT]',
  },
  { pattern: /\b(api[_-]?key|secret|password|token)\s*[:=]\s*\S+/gi, replacement: '$1=[REDACTED]' },
  { pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, replacement: '[REDACTED_EMAIL]' },
  { pattern: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}\b/g, replacement: '[REDACTED_IBAN]' },
  // Phone-like digit runs; ISO dates are left alone.
  {
    pattern: /(?<![\w-])(?!\d{4}-\d{2}-\d{2}\b)\+?\d[\d\s().-]{7,}\d(?![\w-])/g,
    replacement: '[REDACTED_PHONE]',
  },
];

export function redact(text: string): string {
  let result = text;
  for (const { pattern, replacement } of RULES) result = result.replace(pattern, replacement);
  return result;
}

/**
 * Describes the shape of a value without its content, e.g.
 * `object{id,status,total}` or `array(3)`.
 */
export function describeShape(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === 'object') return `object{${Object.keys(value).slice(0, 12).join(',')}}`;
  return typeof value;
}

/** Caps the length of a summary so logs never carry large blobs. */
export function truncate(text: string, max = 200): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
