#!/usr/bin/env node
/**
 * Fails if the working tree contains likely secrets or forbidden files.
 *
 * Pattern checks are a safety net, not a guarantee: reviewers still read
 * every change. An optional extra denylist (one term or regex per line) can
 * be supplied with SCAN_DENYLIST_FILE; it is kept outside the repository.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.praxia', 'coverage']);
const SELF = 'scripts/scan-secrets.mjs';

const FORBIDDEN_FILES = [
  /(^|\/)\.env$/,
  /(^|\/)\.env\.(?!example$)[^/]+$/,
  /\.(pem|key|p12|pfx)$/,
  /(^|\/)credentials\.json$/,
  /(^|\/)service-account[^/]*\.json$/,
  /(^|\/)(secrets|private|customer-data|production)\//,
];

const PATTERNS = [
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['OpenAI-style key', /\bsk-[A-Za-z0-9_-]{20,}/],
  ['Anthropic key', /\bsk-ant-[A-Za-z0-9_-]{10,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ['Slack token', /\bxox[abposr]-[A-Za-z0-9-]{10,}/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/],
  ['Bearer token literal', /Bearer\s+[A-Za-z0-9._~+/-]{24,}/],
  [
    'database URL with credentials',
    /\b(postgres(ql)?|mysql|mongodb(\+srv)?):\/\/[^\s:/]+:[^\s@/]+@/i,
  ],
  ['hosted database host', /\b[a-z0-9]{20}\.supabase\.(co|in)\b/],
  [
    'assigned secret',
    /\b(api[_-]?key|secret|password|passwd|token|client[_-]?secret)\b\s*[:=]\s*['"][^'"\s]{8,}['"]/i,
  ],
  ['personal webmail address', /[A-Za-z0-9._%+-]+@(gmail|hotmail|outlook|yahoo|icloud)\.com\b/i],
];

function loadDenylist() {
  const file = process.env.SCAN_DENYLIST_FILE;
  if (!file) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((term) => ['denylisted term', new RegExp(term, 'i')]);
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

const patterns = [...PATTERNS, ...loadDenylist()];
const findings = [];
let scanned = 0;

for (const full of walk(ROOT)) {
  const rel = relative(ROOT, full);
  if (FORBIDDEN_FILES.some((re) => re.test(rel))) {
    findings.push(`${rel}: forbidden file`);
    continue;
  }
  if (rel === SELF || rel === 'package-lock.json') continue;
  const buffer = readFileSync(full);
  if (buffer.includes(0)) continue; // binary
  scanned++;
  buffer
    .toString('utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const [label, re] of patterns) {
        if (re.test(line)) findings.push(`${rel}:${i + 1}: ${label}`);
      }
    });
}

if (findings.length) {
  console.error(`Secret scan failed (${findings.length} finding(s)):`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`Secret scan passed: ${scanned} files, ${patterns.length} patterns.`);
