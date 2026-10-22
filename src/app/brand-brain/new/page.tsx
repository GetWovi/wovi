import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BrainShell } from "@/components/brand-brain/BrainShell";
import { PastePosts } from "@/components/brand-brain/PastePosts";
import shell from "@/components/builder/Builder.module.css";
import { Icon } from "@/components/ui/Icon";
import { accounts } from "@/lib/accounts/server";
import { can } from "@/lib/accounts/policy";
import { BrandError } from "@/lib/brand/brains";
import { brandPage } from "@/lib/brand/server";

export const metadata: Metadata = { title: "Build a Brand Brain", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function NewBrainPage({ searchParams }: { searchParams: Promise<{ brain?: string }> }) {
  const { brain: brainId } = await searchParams;
  const { info, me, workspaceId, role, csrf, brands } = await brandPage("/brand-brain/new");
  if (!role || !can(role, "edit_brand_brain")) notFound();
  const existing = brainId ? await brands.get(me, workspaceId, brainId).catch((e) => (e instanceof BrandError ? null : Promise.reject(e))) : null;
  if (brainId && !existing) notFound();
  const workspaces = await accounts().workspaces.listForUser(info.user.id);
  const current = workspaces.find((w) => w.id === workspaceId);

  return (
    <BrainShell workspace={current?.name ?? "Workspace"} role={role} who={info.user.name ?? info.user.email ?? "You"} builder={accounts().isBuilder(info.user)}>
      <div className={shell.head}>
        <div className={shell.headText}>
          <Link href={existing ? `/brand-brain/${existing.brain.id}` : "/brand-brain"} className={shell.crumb}>
            <Icon name="chevron-right" size={16} style={{ rotate: "180deg" }} /> {existing ? existing.body.name : "Brand Brains"}
          </Link>
          <h1>{existing ? "Rebuild from past posts" : "Build from past posts"}</h1>
          <p className={shell.lead}>Paste 3 to 5 posts that did well. We propose the voice, topics, dos and don&apos;ts. You check every part before it is saved.</p>
        </div>
      </div>
      <PastePosts csrf={csrf} start={{ brainId: existing?.brain.id, name: existing?.body.name ?? "", niche: existing?.body.niche ?? "", platforms: existing?.body.platforms ?? [] }} />
    </BrainShell>
  );
}
