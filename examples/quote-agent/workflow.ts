/**
 * Quote drafting: synthetic service request → fictional customer →
 * fictional price list → quote agent → draft quote → approval → audit.
 *
 * Design rule shown here: the model interprets the request, but prices and
 * totals are computed by deterministic code. Changing a price is MANUAL_ONLY.
 *
 * The venue, price list and tax rate are invented for this example.
 */
import {
  type CompletionRequest,
  defineAgent,
  defineTool,
  defineWorkflow,
  staticContext,
} from '../../src/index.js';
import { lastUserMessage } from '../shared/demo.js';

export interface ServiceRequest {
  customer: { name: string; company: string };
  message: string;
}

export const sampleRequest: ServiceRequest = {
  customer: { name: 'Maya Lindqvist', company: 'Saltmarrow Studio' },
  message:
    'Hello! We would like a quote for a product launch evening at your venue: about 60 guests, ' +
    '4 hours, a drinks reception, a sound system and a photographer for 3 hours. ' +
    'Is there any discount for returning customers?',
};

interface PriceItem {
  label: string;
  unit: string;
  unitPrice: number;
}

/** Fictional price list for a fictional venue, "Larkspire Hall". */
export const priceList: Record<string, PriceItem> = {
  venue_hour: { label: 'Venue hire', unit: 'hour', unitPrice: 120 },
  reception_guest: { label: 'Drinks reception', unit: 'guest', unitPrice: 18 },
  sound_system: { label: 'Sound system', unit: 'event', unitPrice: 250 },
  photographer_hour: { label: 'Photographer', unit: 'hour', unitPrice: 90 },
  staff_hour: { label: 'Event staff', unit: 'hour', unitPrice: 35 },
};
const TAX_RATE = 0.1; // fictional
const CURRENCY = 'EUR';

export const priceListContext = staticContext('priceList', priceList);

interface RequestedLine {
  sku: string;
  quantity: number;
}

interface Interpretation {
  lines: RequestedLine[];
  unmatched: string[];
  discountRequested: boolean;
}

export const interpretRequest = defineAgent<
  { request: ServiceRequest; catalog: Record<string, PriceItem> },
  Interpretation
>({
  name: 'interpret-request',
  async run({ request, catalog }, ctx) {
    const catalogText = Object.entries(catalog)
      .map(([sku, item]) => `${sku}: ${item.label} (per ${item.unit})`)
      .join('\n');
    const out = await ctx.completeJson<Partial<Interpretation>>('extract', {
      system:
        'Map the customer request to catalog items. Only use SKUs from the catalog. Do not ' +
        'invent prices. Return JSON: {"lines": [{"sku": string, "quantity": number}], ' +
        '"unmatched": string[], "discountRequested": boolean}.\n\nCatalog:\n' +
        catalogText,
      messages: [{ role: 'user', content: request.message }],
      maxTokens: 400,
    });

    // Never trust the model with the catalog: drop unknown SKUs and bad quantities.
    const lines: RequestedLine[] = [];
    const unmatched = Array.isArray(out.unmatched) ? out.unmatched.map(String) : [];
    for (const line of Array.isArray(out.lines) ? out.lines : []) {
      const quantity = Number(line?.quantity);
      if (line && line.sku in catalog && Number.isFinite(quantity) && quantity > 0) {
        lines.push({ sku: line.sku, quantity });
      } else {
        unmatched.push(String(line?.sku ?? 'unknown item'));
      }
    }
    return { lines, unmatched, discountRequested: out.discountRequested === true };
  },
  summarize: (o) => `lines=${o.lines.length} unmatched=${o.unmatched.length}`,
});

export interface QuoteDraft {
  customer: string;
  lines: { sku: string; label: string; quantity: number; unitPrice: number; amount: number }[];
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  notes: string[];
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Deterministic pricing. The model never computes money. */
export const priceQuote = defineTool<
  { customer: string; lines: RequestedLine[]; notes: string[] },
  QuoteDraft
>({
  name: 'price-quote',
  description: 'Prices requested lines against the price list.',
  policy: 'AUTO',
  readOnly: true,
  async execute({ customer, lines, notes }) {
    const priced = lines.map(({ sku, quantity }) => {
      const item = priceList[sku];
      if (!item) throw new Error(`Unknown SKU ${sku}`);
      return {
        sku,
        label: item.label,
        quantity,
        unitPrice: item.unitPrice,
        amount: round(item.unitPrice * quantity),
      };
    });
    const subtotal = round(priced.reduce((sum, l) => sum + l.amount, 0));
    const tax = round(subtotal * TAX_RATE);
    return {
      customer,
      lines: priced,
      subtotal,
      tax,
      total: round(subtotal + tax),
      currency: CURRENCY,
      notes,
    };
  },
  summarize: (q) => `lines=${q.lines.length} total=${q.total} ${q.currency}`,
});

export class MockQuoteBook {
  readonly drafts: QuoteDraft[] = [];
}

export function saveQuoteDraftTool(book: MockQuoteBook) {
  return defineTool<QuoteDraft, { quoteId: string }>({
    name: 'save-quote-draft',
    description: 'Saves the quote as a draft ready to send (mock).',
    policy: 'REQUIRES_APPROVAL',
    async execute(quote) {
      book.drafts.push(quote);
      return { quoteId: `Q-${String(book.drafts.length).padStart(4, '0')}` };
    },
    describe: (q) =>
      `Save quote for ${q.customer}: ${q.lines.map((l) => `${l.quantity}× ${l.label}`).join(', ')} ` +
      `= ${q.total} ${q.currency} incl. tax`,
    summarize: (o) => `quote=${o.quoteId}`,
  });
}

/** Prices are business decisions. The runtime will never execute this. */
export const changePrice = defineTool<{ reason: string }, never>({
  name: 'change-price',
  description: 'Changes prices or applies a discount.',
  policy: 'MANUAL_ONLY',
  async execute() {
    throw new Error('unreachable: MANUAL_ONLY tools are never executed by the runtime');
  },
  describe: (i) => i.reason,
});

export function quoteWorkflow(book: MockQuoteBook) {
  const saveQuoteDraft = saveQuoteDraftTool(book);

  return defineWorkflow({
    id: 'quote-draft',
    accepts: ['service.requested'],
    context: [priceListContext],
    async run(ctx) {
      const request = ctx.event.payload as ServiceRequest;
      const catalog = ctx.data.priceList as Record<string, PriceItem>;
      const interpretation = await ctx.agent(interpretRequest, { request, catalog });

      const notes = interpretation.unmatched.length
        ? [`Not in the price list, needs a human: ${interpretation.unmatched.join(', ')}`]
        : [];

      if (interpretation.discountRequested) {
        await ctx.tool(changePrice, {
          reason: `Customer asked about a discount (${request.customer.company})`,
        });
        notes.push('Customer asked about a discount. Pricing changes are manual.');
      }

      const priced = await ctx.tool(priceQuote, {
        customer: `${request.customer.name}, ${request.customer.company}`,
        lines: interpretation.lines,
        notes,
      });
      if (priced.status !== 'executed') return { status: priced.status };

      const saved = await ctx.tool(saveQuoteDraft, priced.output);
      return {
        quote: priced.output,
        saved: saved.status === 'executed' ? saved.output.quoteId : saved.status,
      };
    },
  });
}

export function quoteMock(request: CompletionRequest): object {
  const text = lastUserMessage(request.messages).toLowerCase();
  const guests = Number(text.match(/(\d+)\s*guests/)?.[1] ?? 0);
  const hours = Number(text.match(/(\d+)\s*hours,/)?.[1] ?? 0);
  const photoHours = Number(text.match(/photographer for (\d+) hours/)?.[1] ?? 0);
  const lines = [
    hours && { sku: 'venue_hour', quantity: hours },
    guests && text.includes('reception') && { sku: 'reception_guest', quantity: guests },
    text.includes('sound system') && { sku: 'sound_system', quantity: 1 },
    photoHours && { sku: 'photographer_hour', quantity: photoHours },
  ].filter(Boolean);
  return { lines, unmatched: [], discountRequested: text.includes('discount') };
}
