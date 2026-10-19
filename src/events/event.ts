import { randomUUID } from 'node:crypto';

/**
 * Something that happened in the business and should start a workflow:
 * an email arrived, a form was submitted, a lead was created.
 *
 * The payload is available to agents and tools, but it is never written to
 * the audit log: only `type` and `id` are.
 */
export interface BusinessEvent<TPayload = unknown> {
  readonly id: string;
  readonly type: string;
  readonly source: string;
  readonly receivedAt: string;
  readonly payload: TPayload;
}

export interface CreateEventInput<TPayload> {
  type: string;
  source: string;
  payload: TPayload;
  id?: string;
  receivedAt?: Date;
}

export function createEvent<TPayload>(input: CreateEventInput<TPayload>): BusinessEvent<TPayload> {
  if (!input.type.trim()) throw new TypeError('Event type is required');
  return Object.freeze({
    id: input.id ?? randomUUID(),
    type: input.type,
    source: input.source,
    receivedAt: (input.receivedAt ?? new Date()).toISOString(),
    payload: input.payload,
  });
}
