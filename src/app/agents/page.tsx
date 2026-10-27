import type { Metadata } from "next";
import { LOGO_FILES } from "@/components/brand/Logo";
import { AgentCards } from "@/components/home/AgentGallery";
import gallery from "@/components/home/AgentGallery.module.css";
import home from "@/components/home/home.module.css";
import { SiteFooter, SiteHeader } from "@/components/site/SiteHeader";

const description =
  "WOVI's AI agents for content: trends, ideas, hooks, scripts, captions, hashtags and repurposing. One agent, one job, each reading your Brand Brain first.";

export const metadata: Metadata = {
  title: "Agents",
  description,
  alternates: { canonical: "/agents" },
  openGraph: { title: "The agents | WOVI", description, url: "/agents", images: [{ url: LOGO_FILES.ogBanner, width: 1200, height: 630 }] },
};

/** Every live agent, as the homepage's cards; each opens its own page. */
export default function AgentsIndexPage() {
  return (
    <>
      <SiteHeader links={[{ href: "/agents", label: "Agents" }]} />
      <main>
        <section className={home.section} aria-labelledby="agents-title">
          <div className="container">
            <div className={home.head}>
              <span className="eyebrow">The agents</span>
              <h1 id="agents-title" className={home.title}>
                One agent, one job. Pick the one for the task.
              </h1>
              <p className={home.lead}>
                Each agent is built and scored on one outcome. Open one to see what it asks you, what it hands back and a real result from the test runs.
              </p>
            </div>
            <AgentCards />
            <p className={gallery.note}>Brand fit shown is a sample. Real scores come from verified runs against your own Brand Brain.</p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
