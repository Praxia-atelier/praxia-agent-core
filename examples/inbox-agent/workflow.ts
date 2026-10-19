/**
 * Inbox triage: fictional email → classify → extract → create mock record → audit.
 *
 * The categories, prompts and fields here are a minimal illustration written
 * for this example.
 */
import {
  type CompletionRequest,
  defineAgent,
  defineTool,
  defineWorkflow,
  expectOneOf,
} from '../../src/index.js';
import { lastUserMessage } from '../shared/demo.js';
import type { IncomingEmail } from './data.js';

export const CATEGORIES = ['invoice', 'quote_request', 'general'] as const;
export type Category = (typeof CATEGORIES)[number];

const emailAsText = (e: IncomingEmail) => `Subject: ${e.subject}\n\n${e.body}`;

export const classifyEmail = defineAgent<IncomingEmail, { category: Category; reason: string }>({
  name: 'classify-email',
  description: 'Sorts an incoming email into a small set of categories.',
  async run(email, ctx) {
    const out = await ctx.completeJson<{ category?: unknown; reason?: unknown }>('classify', {
      system:
        'You triage a small company inbox. Classify the email as "invoice" (a supplier bill), ' +
        '"quote_request" (someone asking for a price) or "general" (anything else). ' +
        'Return JSON: {"category": string, "reason": string}.',
      messages: [{ role: 'user', content: emailAsText(email) }],
      maxTokens: 200,
    });
    return {
      category: expectOneOf(out.category, CATEGORIES, 'category'),
      reason: String(out.reason ?? ''),
    };
  },
  summarize: (o) => `category=${o.category}`,
});

export interface InvoiceFields {
  supplier: string;
  invoiceNumber: string;
  total: number;
  currency: string;
  dueDate: string | null;
}

export const extractInvoice = defineAgent<IncomingEmail, InvoiceFields>({
  name: 'extract-invoice',
  async run(email, ctx) {
    const out = await ctx.completeJson<Partial<InvoiceFields>>('extract', {
      system:
        'Extract invoice fields from the email. Return JSON with keys supplier, invoiceNumber, ' +
        'total (number), currency (ISO code), dueDate (YYYY-MM-DD or null). Use null if unknown.',
      messages: [{ role: 'user', content: emailAsText(email) }],
      maxTokens: 300,
    });
    const total = Number(out.total);
    if (!Number.isFinite(total)) throw new Error('Invoice total is missing or not a number');
    return {
      supplier: String(out.supplier ?? 'unknown'),
      invoiceNumber: String(out.invoiceNumber ?? 'unknown'),
      total,
      currency: String(out.currency ?? 'EUR'),
      dueDate: out.dueDate ? String(out.dueDate) : null,
    };
  },
  summarize: (o) => `invoice=${o.invoiceNumber} total=${o.total} ${o.currency}`,
});

export interface QuoteRequestFields {
  requester: string;
  organization: string | null;
  summary: string;
}

export const extractQuoteRequest = defineAgent<IncomingEmail, QuoteRequestFields>({
  name: 'extract-quote-request',
  async run(email, ctx) {
    const out = await ctx.completeJson<Partial<QuoteRequestFields>>('extract', {
      system:
        'Extract who is asking for a quote and what they need. Return JSON with keys requester, ' +
        'organization (or null) and summary (one sentence).',
      messages: [{ role: 'user', content: emailAsText(email) }],
      maxTokens: 300,
    });
    return {
      requester: String(out.requester ?? 'unknown'),
      organization: out.organization ? String(out.organization) : null,
      summary: String(out.summary ?? ''),
    };
  },
  summarize: () => 'quote request extracted',
});

/** A stand-in for a real system of record. */
export class MockRecordStore {
  readonly records: { id: string; type: string; data: unknown }[] = [];

  add(type: string, data: unknown) {
    const id = `${type.toUpperCase().slice(0, 3)}-${String(this.records.length + 1).padStart(4, '0')}`;
    this.records.push({ id, type, data });
    return { id, type };
  }
}

export function createRecordTool(store: MockRecordStore) {
  return defineTool<{ type: string; data: unknown }, { id: string; type: string }>({
    name: 'create-record',
    description: 'Creates a draft record in the (mock) system of record.',
    policy: 'AUTO',
    async execute(input) {
      return store.add(input.type, input.data);
    },
    describe: (i) => `Create a ${i.type} record`,
    summarize: (o) => `record=${o.id} type=${o.type}`,
  });
}

export function inboxWorkflow(store: MockRecordStore) {
  const createRecord = createRecordTool(store);

  return defineWorkflow({
    id: 'inbox-triage',
    description: 'Classify an incoming email and file it.',
    accepts: ['email.received'],
    async run(ctx) {
      const email = ctx.event.payload as IncomingEmail;
      const { category } = await ctx.agent(classifyEmail, email);

      if (category === 'general') return { category, action: 'none' };

      const fields =
        category === 'invoice'
          ? await ctx.agent(extractInvoice, email)
          : await ctx.agent(extractQuoteRequest, email);

      const record = await ctx.tool(createRecord, { type: category, data: fields });
      return {
        category,
        action: record.status === 'executed' ? `created ${record.output.id}` : record.status,
        fields,
      };
    },
    summarize: (o) => `category=${o.category} action=${o.action}`,
  });
}

/** Offline answers for `PRAXIA_PROVIDER=mock`. Keyword rules, only for the demo data. */
export function inboxMock(request: CompletionRequest): object {
  const text = lastUserMessage(request.messages);
  const lower = text.toLowerCase();

  if (request.task === 'classify') {
    if (lower.includes('invoice')) return { category: 'invoice', reason: 'mentions an invoice' };
    if (lower.includes('quote')) return { category: 'quote_request', reason: 'asks for a quote' };
    return { category: 'general', reason: 'no request detected' };
  }

  if (lower.includes('invoice')) {
    return {
      supplier: text.match(/Supplier:\s*(.+)/)?.[1]?.trim() ?? null,
      invoiceNumber: text.match(/invoice\s+([A-Z]{2}-\d+)/i)?.[1] ?? null,
      total: Number(text.match(/Total due:\s*([\d.]+)/)?.[1] ?? Number.NaN),
      currency: text.match(/Total due:\s*[\d.]+\s*([A-Z]{3})/)?.[1] ?? null,
      dueDate: text.match(/Due date:\s*(\d{4}-\d{2}-\d{2})/)?.[1] ?? null,
    };
  }
  const signature = text.match(/Thanks,\s*([^,\n]+),\s*([^\n]+)/);
  return {
    requester: signature?.[1]?.trim() ?? 'unknown',
    organization: signature?.[2]?.trim() ?? null,
    summary: 'Quote for a one-day team offsite for about 30 people with room, lunch and projector.',
  };
}
