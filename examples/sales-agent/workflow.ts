/**
 * Sales follow-up: synthetic lead → mock enrichment → mock CRM context →
 * agent analysis → personalized email draft → human approval → audit.
 *
 * There is no lead scoring here on purpose: the example shows the shape of
 * the workflow, not a qualification model. All data is fictional.
 */
import {
  type CompletionRequest,
  defineAgent,
  defineTool,
  defineWorkflow,
  staticContext,
} from '../../src/index.js';

export interface Lead {
  name: string;
  email: string;
  company: string;
  role: string;
  /** What the lead did, e.g. downloaded a guide. */
  signal: string;
}

export const sampleLead: Lead = {
  name: 'Jordan Rivera',
  email: 'jordan@driftmoor.example',
  company: 'Driftmoor Analytics',
  role: 'Head of Operations',
  signal: 'Downloaded a guide about automating supplier invoice intake.',
};

/** Fictional CRM history for the lead. */
export const mockCrm = staticContext('crm', {
  stage: 'new',
  lastInteraction: 'Attended an online workshop on document automation two weeks ago.',
  owner: 'Alex Moreau',
});

interface Enrichment {
  industry: string;
  size: string;
  note: string;
}

/** A read-only lookup against a fictional company directory. */
export const enrichCompany = defineTool<{ company: string }, Enrichment>({
  name: 'enrich-company',
  description: 'Looks up public company facts (mock directory).',
  policy: 'AUTO',
  readOnly: true,
  async execute({ company }) {
    const directory: Record<string, Enrichment> = {
      'Driftmoor Analytics': {
        industry: 'Logistics software',
        size: '50-200 employees',
        note: 'Recently opened a second office.',
      },
    };
    return directory[company] ?? { industry: 'unknown', size: 'unknown', note: '' };
  },
  summarize: (o) => `industry=${o.industry} size=${o.size}`,
});

interface Analysis {
  angle: string;
  talkingPoints: string[];
}

export const analyzeLead = defineAgent<{ lead: Lead; company: Enrichment; crm: unknown }, Analysis>(
  {
    name: 'analyze-lead',
    async run(input, ctx) {
      const out = await ctx.completeJson<Partial<Analysis>>('analyze', {
        system:
          'You help a salesperson prepare a first follow-up. Using the lead, company facts and CRM ' +
          'history, suggest one relevant angle and up to three short talking points. ' +
          'Return JSON: {"angle": string, "talkingPoints": string[]}.',
        messages: [{ role: 'user', content: JSON.stringify(input) }],
        maxTokens: 400,
      });
      return {
        angle: String(out.angle ?? ''),
        talkingPoints: Array.isArray(out.talkingPoints)
          ? out.talkingPoints.map(String).slice(0, 3)
          : [],
      };
    },
    summarize: (o) => `talking_points=${o.talkingPoints.length}`,
  },
);

interface Draft {
  subject: string;
  body: string;
}

export const draftEmail = defineAgent<{ lead: Lead; analysis: Analysis; sender: string }, Draft>({
  name: 'draft-email',
  async run(input, ctx) {
    const out = await ctx.completeJson<Partial<Draft>>('draft', {
      system:
        'Write a short, friendly, non-pushy follow-up email (under 120 words) based on the ' +
        'analysis. No invented facts, no prices, one clear question at the end. ' +
        'Return JSON: {"subject": string, "body": string}.',
      messages: [{ role: 'user', content: JSON.stringify(input) }],
      maxTokens: 500,
    });
    if (!out.subject || !out.body) throw new Error('Draft is missing a subject or body');
    return { subject: String(out.subject), body: String(out.body) };
  },
  summarize: (o) => `draft words=${o.body.split(/\s+/).length}`,
});

/** A fake outbox. Nothing leaves the process. */
export class MockOutbox {
  readonly sent: { to: string; subject: string; body: string }[] = [];
}

export function sendEmailTool(outbox: MockOutbox) {
  return defineTool<{ to: string; subject: string; body: string }, { messageId: string }>({
    name: 'send-email',
    description: 'Sends an email (mock outbox).',
    policy: 'REQUIRES_APPROVAL',
    async execute(message) {
      outbox.sent.push(message);
      return { messageId: `mock-${outbox.sent.length}` };
    },
    describe: (m) => `Send "${m.subject}" to ${m.to}\n\n${m.body.replace(/^/gm, '    ')}\n`,
    summarize: (o) => `message=${o.messageId}`,
  });
}

export function salesWorkflow(outbox: MockOutbox) {
  const sendEmail = sendEmailTool(outbox);

  return defineWorkflow({
    id: 'lead-follow-up',
    accepts: ['lead.created'],
    context: [mockCrm],
    async run(ctx) {
      const lead = ctx.event.payload as Lead;

      const enrichment = await ctx.tool(enrichCompany, { company: lead.company });
      const company =
        enrichment.status === 'executed'
          ? enrichment.output
          : { industry: 'unknown', size: 'unknown', note: '' };

      const analysis = await ctx.agent(analyzeLead, { lead, company, crm: ctx.data.crm });
      const sender = (ctx.data.crm as { owner: string }).owner;
      const draft = await ctx.agent(draftEmail, { lead, analysis, sender });

      const sent = await ctx.tool(sendEmail, { to: lead.email, ...draft });
      return { draft, delivery: sent.status };
    },
    summarize: (o) => `delivery=${o.delivery}`,
  });
}

export function salesMock(request: CompletionRequest): object {
  if (request.task === 'analyze') {
    return {
      angle:
        'Reduce manual work in supplier invoice intake as the team grows into a second office.',
      talkingPoints: [
        'They are researching invoice intake automation.',
        'A second office usually means more suppliers and more paperwork.',
        'They already attended the document automation workshop.',
      ],
    };
  }
  return {
    subject: 'Invoice intake at Driftmoor',
    body: [
      'Hi Jordan,',
      '',
      'Thanks for downloading our guide on supplier invoice intake, and for joining the',
      'document automation workshop. With a second office opening, invoice volume tends to',
      'grow faster than the team that handles it.',
      '',
      'Would a 20-minute call next week be useful to see how others handle this?',
      '',
      'Best,',
      'Alex',
    ].join('\n'),
  };
}
