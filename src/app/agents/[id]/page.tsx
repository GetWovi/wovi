import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LOGO_FILES } from "@/components/brand/Logo";
import { AgentShowcase } from "@/components/agents/AgentShowcase";
import { showcaseAgent, showcaseAgents, showcaseExample } from "@/lib/agents/showcase-view";

/** One static page per live launch agent; any other id is a 404. */
export const dynamicParams = false;

export function generateStaticParams(): { id: string }[] {
  return showcaseAgents().map((a) => ({ id: a.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const agent = showcaseAgent(id);
  if (!agent) return { title: "Agent not found", robots: { index: false, follow: false } };
  const title = `${agent.name}, an AI agent for content`;
  const description = `${agent.job} It reads your Brand Brain first, every result is checked against a quality bar and waits for your yes.`;
  return {
    title,
    description,
    alternates: { canonical: `/agents/${agent.id}` },
    // The whole openGraph object replaces the root one, so the share image is named again.
    openGraph: { title: `${agent.name} | WOVI`, description, url: `/agents/${agent.id}`, images: [{ url: LOGO_FILES.ogBanner, width: 1200, height: 630 }] },
  };
}

export default async function AgentPublicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = showcaseAgent(id);
  if (!agent) notFound();
  return <AgentShowcase agent={agent} example={showcaseExample(agent.id)} />;
}
