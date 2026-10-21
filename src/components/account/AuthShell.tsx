import type { ReactNode } from "react";
import { Mascot } from "@/components/brand/Mascot";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Card } from "@/components/ui/Card";
import styles from "./Account.module.css";

/** The site header and one centered card, for sign-in and invite screens. */
export function AuthShell({ title, lead, children }: { title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className={styles.authMain}>
        <Card padding="lg" className={styles.authCard}>
          <div className={styles.authHead}>
            <Mascot pose="hello" size={64} label="" />
            <h1>{title}</h1>
            {lead && <p className={styles.lead}>{lead}</p>}
          </div>
          {children}
        </Card>
      </main>
    </>
  );
}
