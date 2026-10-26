import type { Metadata } from "next";
import styles from "@/components/app/App.module.css";
import { AppShell } from "@/components/app/AppShell";
import { Onboarding } from "@/components/app/Onboarding";
import { accounts } from "@/lib/accounts/server";
import { can } from "@/lib/accounts/policy";
import { isStep, reachableStep } from "@/lib/app/onboarding";
import { appPage } from "@/lib/app/server";
import { appBrands } from "@/lib/brand/server";

export const metadata: Metadata = { title: "Welcome", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ step?: string; restart?: string }> }) {
  const { step: wanted, restart } = await searchParams;
  const { info, me, workspaceId, csrf, api } = await appPage("/app/welcome");
  const role = await accounts().roleIn(me, workspaceId);
  const editor = role ? can(role, "edit_brand_brain") : false;
  if (restart) await api.restartOnboarding(me, workspaceId);
  const state = await api.onboarding(me, workspaceId);
  const proposal = await api.onboardingProposal(me, workspaceId);
  const step = isStep(wanted) ? reachableStep({ ...state, proposalId: proposal ? state.proposalId : null }, wanted) : state.status === "open" && state.proposalId && proposal ? state.step : state.status === "open" ? state.step : "welcome";
  const first = info.user.name?.split(" ")[0] ?? null;
  // What the AI read of the posts costs, shown before the person asks for it.
  const quote = editor ? await appBrands().readQuote(me, workspaceId) : ({ mode: "off" } as const);

  return (
    <AppShell info={info}>
      <div className={styles.head}>
        <div className={styles.headText}>
          <span className="eyebrow">Welcome{first ? `, ${first}` : ""}</span>
        </div>
      </div>
      <Onboarding csrf={csrf} start={{ ...state, step }} proposal={proposal} editor={editor} quote={quote} />
    </AppShell>
  );
}
