import dynamic from "next/dynamic";
import { SiteHeader, mainLinks } from "@/components/site/SiteHeader";
import { Hero } from "@/components/home/Hero";
import { LiveDemo } from "@/components/home/LiveDemo";
import { Pipeline } from "@/components/home/Pipeline";
import { BrandBrain } from "@/components/home/BrandBrain";
import { AgentGallery } from "@/components/home/AgentGallery";
import { AntiSlop } from "@/components/home/AntiSlop";
import { Creators } from "@/components/home/Creators";
import { Closing } from "@/components/home/Closing";
import { HomeLegalStrip } from "@/components/safety/LegalLinks";

/* The code panel is far below the fold; load it when needed. */
const PlugIn = dynamic(() => import("@/components/home/PlugIn").then((m) => m.PlugIn));

export default function Home() {
  return (
    // A wrapper first, so Next opens the page at the top instead of scrolled past the sticky header.
    <div>
      <SiteHeader
        active="home"
        links={mainLinks(true)}
      />
      <main>
        <Hero />
        <LiveDemo />
        <Pipeline />
        <BrandBrain />
        <AgentGallery />
        <AntiSlop />
        <PlugIn />
        <Creators />
        <Closing />
        <HomeLegalStrip />
      </main>
    </div>
  );
}
