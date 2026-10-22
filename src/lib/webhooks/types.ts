/**
 * Webhook records (phase 14). Types and fixed lists only, so client code can
 * import them.
 *
 * An endpoint is a URL a workspace registers for some events. Every event
 * that happens in the workspace becomes one delivery per endpoint that wants
 * it: a signed POST, tried again with backoff until it lands or the tries run
 * out, with every try logged.
 */

export const WEBHOOK_EVENTS = ["run.finished", "pipeline.waiting", "pipeline.finished"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
/** A test delivery sent from the settings page or the API. Endpoints always get it when asked. */
export type DeliveryType = WebhookEvent | "ping";

export const EVENT_WORDS: Record<DeliveryType, string> = {
  "run.finished": "A run finished: it succeeded, failed or was stopped.",
  "pipeline.waiting": "A pipeline waits for a person to pick an option.",
  "pipeline.finished": "A pipeline is ready for approval, failed or was stopped.",
  ping: "A test delivery.",
};

export type WebhookEndpoint = {
  id: string;
  workspaceId: string;
  url: string;
  events: WebhookEvent[];
  description: string;
  /** The signing secret, sealed with the server secret. Never sent back after it is made. */
  secretSealed: string;
  /** The last characters of the secret, so people can tell secrets apart. */
  secretHint: string;
  /** The person who made it, or the person whose key made it. Deliveries stop when they can no longer manage webhooks. */
  createdBy: string;
  /** "user" or "key:<key id>". */
  createdVia: string;
  createdAt: string;
  updatedAt: string;
  /** Paused endpoints get nothing. */
  pausedAt: string | null;
};

export type DeliveryStatus = "pending" | "delivered" | "failed";

export type DeliveryAttempt = {
  n: number;
  at: string;
  /** The HTTP status, or null when nothing answered. */
  status: number | null;
  ms: number;
  error?: string;
  /** Which sender took it: "dev" logs it on this machine and sends nothing. */
  sender: string;
};

export type WebhookDelivery = {
  /** Made from the endpoint and the event, so one event lands once per endpoint. */
  id: string;
  workspaceId: string;
  endpointId: string;
  eventId: string;
  type: DeliveryType;
  /** The exact body that is signed and sent. */
  body: string;
  status: DeliveryStatus;
  attempts: DeliveryAttempt[];
  nextAttemptAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** An endpoint as people and the API see it: no secret. */
export type EndpointView = Omit<WebhookEndpoint, "secretSealed">;

export const endpointView = (e: WebhookEndpoint): EndpointView => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { secretSealed, ...rest } = e;
  return rest;
};
