/**
 * Stripe's webhook (docs/credits.md, "Card top-ups"). The raw body and its
 * Stripe-Signature header go to StripeEvents, which checks the signature with
 * STRIPE_WEBHOOK_SECRET before anything else. Card top-ups get their credits
 * here and nowhere else.
 */
import { appStripe } from "@/lib/credits/stripe-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 512 * 1024;

export async function POST(req: Request): Promise<Response> {
  const stripe = appStripe();
  if (!stripe) return Response.json({ received: false, error: "Card payments are not set up." }, { status: 404 });
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > MAX_BYTES) return Response.json({ received: false, error: "Too large." }, { status: 413 });
  const raw = await req.text();
  if (raw.length > MAX_BYTES) return Response.json({ received: false, error: "Too large." }, { status: 413 });
  const answer = await stripe.events.handle(raw, req.headers.get("stripe-signature"));
  return Response.json(answer.body, { status: answer.status });
}
