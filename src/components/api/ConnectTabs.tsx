"use client";

import { Tabs } from "@/components/ui/Tabs";
import type { Snippet } from "@/lib/api/snippets";
import { CodeBlock } from "./CodeBlock";

/** One tab per assistant, each with its config. */
export function ConnectTabs({ snippets, defaultId }: { snippets: Snippet[]; defaultId?: string }) {
  return <Tabs defaultId={defaultId} items={snippets.map((sn) => ({ id: sn.id, label: sn.title, content: <CodeBlock snippet={sn} /> }))} />;
}
