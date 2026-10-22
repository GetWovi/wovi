import type { Metadata } from "next";
import styles from "@/components/app/App.module.css";
import { AppShell } from "@/components/app/AppShell";
import { Mascot } from "@/components/brand/Mascot";
import { ClientsBoard } from "@/components/team/ClientsBoard";
import { accounts } from "@/lib/accounts/server";
import { can } from "@/lib/accounts/policy";
import { appPage } from "@/lib/app/server";
import { appTeam } from "@/lib/team/server";

export const metadata: Metadata = { title: "Clients", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const { info, me, workspaceId, csrf, api } = await appPage("/app/clients");
  const [clients, brains, role] = await Promise.all([appTeam().clients(me, workspaceId), api.brains(me, workspaceId), accounts().roleIn(me, workspaceId)]);
  const manage = role ? can(role, "manage_clients") : false;
  const inHouse = brains.filter((b) => !clients.some((c) => c.brandBrainIds.includes(b.id)));
  return (
    <AppShell info={info} active="settings">
      <div className={styles.head}>
        <div className={styles.headText}>
          <span className="eyebrow">Clients</span>
          <h1 className={styles.h1}>
            One workspace, <em>many clients</em>
          </h1>
          <p className={styles.lead}>
            Each client has their own Brand Brains. A link lets them see and approve their own work and nothing else: no other client, no other brand.
            {inHouse.length ? ` ${inHouse.map((b) => b.name).join(", ")} ${inHouse.length === 1 ? "stays" : "stay"} in house.` : ""}
          </p>
        </div>
      </div>
      {!manage && clients.length === 0 ? (
        <div className={[styles.panel, styles.panelAlt, styles.wovi].join(" ")}>
          <Mascot pose="hello" size={120} />
          <b>No clients yet</b>
          <span>An admin or owner adds clients and their links.</span>
        </div>
      ) : (
        <ClientsBoard csrf={csrf} clients={clients} brains={brains.map((b) => ({ id: b.id, name: b.name }))} manage={manage} />
      )}
    </AppShell>
  );
}
