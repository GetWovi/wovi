import dynamic from "next/dynamic";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Hero } from "@/components/home/Hero";
import { LiveDemo } from "@/components/home/LiveDemo";
import { Pipeline } from "@/components/home/Pipeline";
import { BrandBrain } from "@/components/home/BrandBrain";
import { AgentGallery } from "@/components/home/AgentGallery";
import { AntiSlop } from "@/components/home/AntiSlop";
import { Creators } from "@/components/home/Creators";
import { Closing } from "@/components/home/Closing";

/* The code panel is far below the fold; load it when needed. */
const PlugIn = dynamic(() => import("@/components/home/PlugIn").then((m) => m.PlugIn));

export default function Home() {
  return (
    <>
      <SiteHeader
        active="home"
        links={[
          { href: "#agents", label: "Agents" },
          { href: "#pipeline", label: "How it works" },
          { href: "#brand-brain", label: "Brand Brain" },
          { href: "#plug-in", label: "MCP and API" },
          { href: "#creators", label: "Creators" },
        ]}
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
      </main>
    </>
  );
}
