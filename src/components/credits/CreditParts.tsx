import { Mascot } from "@/components/brand/Mascot";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { Price } from "@/lib/app/api";
import { creditWords } from "@/lib/credits/config";
import { chargeWords, type ChargeView } from "@/lib/credits/types";
import styles from "./Credits.module.css";

/** The coin: a small blaze disc, the same everywhere a credit amount shows. */
export function Coin({ size = 12 }: { size?: number }) {
  return (
    <span className={styles.coin} aria-hidden>
      <Icon name="coin" size={size} />
    </span>
  );
}

/** "About 4 credits. The workspace has 500." beside a run button. */
export function PriceLine({ price, what = "a run" }: { price: Price; what?: string }) {
  return (
    <span className={styles.price}>
      <span className={styles.coinTag} title={`What ${what} costs at most`}>
        <Coin /> About {creditWords(price.estimate)}
      </span>
      <span>
        The workspace has <b>{creditWords(price.available)}</b>. You are charged what it really costs, never more than this.
      </span>
    </span>
  );
}

/** Not enough credits, or a monthly limit: what is wrong and what to do about it. */
export function CreditsBlocked({ price, message }: { price: Price; message?: string }) {
  const blocked = price.blocked;
  const limit = blocked?.code === "over_limit";
  return (
    <div className={styles.blocked} role="alert">
      <Mascot pose="wait" size={64} label="Wovi, waiting" />
      <div className={styles.blockedText}>
        <b>{limit ? "This would pass a monthly limit" : "Not enough credits for this"}</b>
        <span>{message ?? blocked?.message ?? `It needs about ${creditWords(price.estimate)}. The workspace has ${creditWords(price.available)}.`}</span>
        {!price.canManage && <span>{limit ? "An owner or admin can raise the limit." : "Ask an owner or admin of this workspace to top up."}</span>}
      </div>
      {price.canManage && (
        <ButtonLink href={limit ? "/app/credits#limits" : "/app/credits#top-up"} size="sm" leading={<Icon name={limit ? "sliders" : "plus"} size={16} />}>
          {limit ? "Change limits" : "Top up"}
        </ButtonLink>
      )}
    </div>
  );
}

/** The charge on a result, in words. */
export function ChargeLine({ charge }: { charge: ChargeView }) {
  return (
    <span className={styles.charge}>
      <Coin /> <b>{chargeWords(charge)}</b>
    </span>
  );
}

/** The charge on a history row: the credits it cost, or "back" when nothing was charged. */
export function RowCharge({ charge }: { charge: ChargeView }) {
  if (charge.state === "free") return null;
  const label = charge.state === "held" ? `${charge.estimate} held` : charge.state === "refunded" ? "0, refunded" : String(charge.charged ?? 0);
  return (
    <span className={styles.rowCharge} title={chargeWords(charge)}>
      <Coin size={10} />
      <span className={charge.state === "refunded" ? styles.rowBack : undefined}>{label}</span>
    </span>
  );
}
