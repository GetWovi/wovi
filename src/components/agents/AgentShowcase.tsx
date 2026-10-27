import Link from "next/link";
import { Sparkle } from "@/components/brand/Accents";
import { Mascot } from "@/components/brand/Mascot";
import { agentIcon, agentTag } from "@/components/app/agent-icons";
import app from "@/components/app/App.module.css";
import { ResultBody, Sources } from "@/components/app/RunResult";
import closing from "@/components/home/Closing.module.css";
import home from "@/components/home/home.module.css";
import q from "@/components/quality/Quality.module.css";
import { SiteFooter, SiteHeader } from "@/components/site/SiteHeader";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { ShowcaseExample } from "@/lib/agents/showcase";
import { askedValues, askRows, brainParts, chainsFor, handsBack, platformNames, qualityGate, whatYouGet, type ShowcaseAgent } from "@/lib/agents/showcase-view";
import { resultView } from "@/lib/app/results";
import { CHECKS } from "@/lib/quality/data";
import s from "./AgentShowcase.module.css";

/** The six checks every result goes through, in the order the scorecard lists them. */
const CHECK_ORDER = ["specificity", "generic_phrases", "brand_fit", "reference_anchoring", "claims", "platform_rules"] as const;

/** Where "Use <agent>" goes: the agent's form in the app. Signed out, the app sends you to sign in and back. */
export const useHref = (id: string) => `/app/make/${id}`;

const times = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);

/**
 * A live agent's public page: everything it can do for a visitor, a real
 * result from the test runs, and the way in. Nothing on it runs anything.
 */
export function AgentShowcase({ agent, example }: { agent: ShowcaseAgent; example: ShowcaseExample | null }) {
  const gets = whatYouGet(agent);
  const asks = askRows(agent);
  const questions = asks.filter((a) => a.key !== "brand");
  const required = questions.filter((a) => a.required).length;
  const parts = brainParts(agent);
  const gate = qualityGate(agent);
  const chains = chainsFor(agent.id);
  const platforms = platformNames(agent);
  const use = `Use ${agent.name}`;
  const view = example ? resultView(example.output) : null;

  return (
    <>
      <SiteHeader links={[{ href: "/agents", label: "Agents" }]} />
      <main>
        {/* 1. Hero */}
        <section className={s.hero} aria-labelledby="agent-title">
          <div className={["container", s.heroGrid].join(" ")}>
            <div className={s.heroCopy}>
              <Link href="/agents" className={s.crumb}>
                <Icon name="arrow-left" size={16} /> All agents
              </Link>
              <div className={s.nameRow}>
                <span className={[home.iconTile, home.iconTileBlaze, s.bigTile].join(" ")}>
                  <Icon name={agentIcon(agent.id)} size={30} />
                </span>
                <div className={s.chips}>
                  <span className={home.chip}>{agentTag(agent.id, agent.category)}</span>
                  <span className={[home.chip, home.chipBlaze].join(" ")}>
                    <span className={s.liveDot} aria-hidden="true" />
                    Live
                  </span>
                </div>
              </div>
              <h1 id="agent-title" className={s.h1}>
                {agent.name}
              </h1>
              <p className={s.lead}>{agent.job}</p>
              <div className={s.platforms}>
                <span className={s.platformsLabel}>Writes for</span>
                <ul className={s.platformList}>
                  {platforms.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
              <div className={s.actions}>
                <ButtonLink href={useHref(agent.id)} size="lg" trailing={<Icon name="arrow-right" />}>
                  {use}
                </ButtonLink>
                {example && (
                  <ButtonLink href="#example" size="lg" variant="ghost">
                    See an example
                  </ButtonLink>
                )}
              </div>
              <p className={s.signNote}>Sign in with your email to use it. Every run is paid with credits.</p>
            </div>

            <div className={[home.panel, s.facts].join(" ")} aria-label={`${agent.name} at a glance`}>
              <div className={s.factsWovi}>
                <Sparkle size={22} className={s.factsSparkle} />
                <Mascot pose="wait" size={132} label="Wovi, waiting for a job" />
              </div>
              <dl className={s.factList}>
                <div className={s.fact}>
                  <dt>Hands back</dt>
                  <dd>{handsBack(agent)}</dd>
                </div>
                <div className={s.fact}>
                  <dt>Asks you</dt>
                  <dd>
                    {questions.length} {questions.length === 1 ? "question" : "questions"}, {required} required
                  </dd>
                </div>
                <div className={s.fact}>
                  <dt>Reads first</dt>
                  <dd>Your Brand Brain</dd>
                </div>
                <div className={s.fact}>
                  <dt>Quality bar</dt>
                  <dd>{gate.bar} of 100</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        {/* 2. What you get */}
        <section className={home.section} aria-labelledby="get-title">
          <div className="container">
            <div className={home.head}>
              <span className="eyebrow">What you get</span>
              <h2 id="get-title" className={home.title}>
                One job, done the same way every time.
              </h2>
            </div>
            <div className={s.getGrid}>
              {gets.map((g, i) => (
                <article key={g.title} className={[home.panel, home.panelTight, i % 2 ? home.panelAlt : "", s.getCard].join(" ")}>
                  <span className={home.iconTile}>
                    <Icon name={g.icon} size={22} />
                  </span>
                  <h3 className={s.cardTitle}>{g.title}</h3>
                  <p className={s.cardText}>{g.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 3. What it asks you */}
        <section className={home.section} aria-labelledby="asks-title">
          <div className={["container", s.split].join(" ")}>
            <div className={home.head}>
              <span className="eyebrow">What it asks you</span>
              <h2 id="asks-title" className={[home.title, home.titleSm].join(" ")}>
                A short form. No prompt to write.
              </h2>
              <p className={home.lead}>
                {questions.length} {questions.length === 1 ? "question" : "questions"}, {required} of them required. The rest can stay as they are, and your Brand Brain fills in who you are.
              </p>
            </div>
            <div className={[home.panel, s.form].join(" ")} aria-label={`${agent.name}'s form, shown read-only`}>
              <span className={home.panelLabel}>The form</span>
              <ul className={s.fields}>
                {asks.map((a) => (
                  <li key={a.key} className={s.field}>
                    <div className={s.fieldHead}>
                      <span className={s.fieldLabel}>{a.label}</span>
                      <span className={[home.chip, a.required ? home.chipBlaze : ""].join(" ")}>{a.required ? "Required" : "Optional"}</span>
                    </div>
                    {a.options.length > 0 ? (
                      <div className={s.options}>
                        {a.options.map((o) => (
                          <span key={o.label} className={[s.option, o.isDefault ? s.optionOn : ""].join(" ")}>
                            {o.label}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className={s.fakeInput} aria-hidden="true">
                        {a.key === "brand" ? "Your default Brand Brain" : a.help}
                      </div>
                    )}
                    <span className={s.fieldKind}>
                      {a.kind}
                      {a.help && (a.options.length > 0 || a.key === "brand") ? `. ${a.help}` : "."}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* 4. A real result */}
        {example && view && (
          <section className={home.section} id="example" aria-labelledby="example-title">
            <div className="container">
              <div className={home.head}>
                <span className="eyebrow">A real result</span>
                <h2 id="example-title" className={home.title}>
                  {example.title}
                </h2>
                <p className={home.lead}>
                  A real result from WOVI&apos;s test runs, for a sample business ({example.business}). Your results use your own Brand Brain.
                </p>
              </div>
              <div className={[app.panel, app.result, s.result].join(" ")}>
                <div className={s.resultHead}>
                  <div className={s.resultTitle}>
                    <span className="eyebrow">{agent.name}</span>
                    <h3>For {example.business}</h3>
                  </div>
                  <div className={q.score} title="The combined score of every quality check, against this agent's bar">
                    <Badge score={example.quality} label="Quality" size="md" />
                    <div className={q.scoreText}>
                      <b>Quality {example.quality}</b>
                      <span>{example.quality >= gate.bar ? `Passed the bar of ${gate.bar}` : `Under the bar of ${gate.bar}`}</span>
                    </div>
                  </div>
                </div>
                <div className={[app.panelAlt, app.panelTight, app.panel, s.asked].join(" ")}>
                  <span className={home.panelLabel}>What it was asked</span>
                  <dl className={[app.asked, s.askedList].join(" ")}>
                    {askedValues(agent, example.inputs).map((r) => (
                      <div key={r.label} className={app.askedRow}>
                        <dt>{r.label}</dt>
                        <dd>{r.text}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <ResultBody view={view} />
                {example.sources && example.sources.length > 0 && <Sources sources={example.sources.map((x) => ({ ...x, searchedAt: null }))} />}
              </div>
            </div>
          </section>
        )}

        {/* 5. How it gets your voice */}
        <section className={home.section} aria-labelledby="voice-title">
          <div className={["container", s.split].join(" ")}>
            <div className={home.head}>
              <span className="eyebrow">How it gets your voice</span>
              <h2 id="voice-title" className={[home.title, home.titleSm].join(" ")}>
                It reads your Brand Brain before it writes a word.
              </h2>
              <p className={home.lead}>
                You set up your Brand Brain once, from a few posts that did well. {agent.name} reads the parts it needs on every run, so what you get sounds like you.
              </p>
            </div>
            <ul className={[home.panel, s.parts].join(" ")}>
              {parts.map((p) => (
                <li key={p.part} className={[s.part, p.used ? "" : s.partOff].join(" ")}>
                  <span className={[home.iconTile, p.used ? home.iconTileBlaze : ""].join(" ")}>
                    <Icon name={p.used ? "check" : "close"} size={20} />
                  </span>
                  <div className={s.partText}>
                    <b>{p.label}</b>
                    <span>{p.used ? p.text : "Not needed for this job."}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 6. Every result is checked */}
        <section className={home.section} aria-labelledby="checks-title">
          <div className="container">
            <div className={home.head}>
              <span className="eyebrow">Every result is checked</span>
              <h2 id="checks-title" className={home.title}>
                Measured, not claimed.
              </h2>
              <p className={home.lead}>Before a result is marked ready, it is scored on six checks. You see the score on every result.</p>
            </div>
            <div className={s.checkGrid}>
              {CHECK_ORDER.map((id, i) => (
                <article key={id} className={[home.panel, home.panelTight, i % 2 ? home.panelAlt : "", s.check].join(" ")}>
                  <span className={s.checkNo}>{String(i + 1).padStart(2, "0")}</span>
                  <h3 className={s.cardTitle}>{CHECKS[id].label}</h3>
                  <p className={s.cardText}>{CHECKS[id].what}</p>
                </article>
              ))}
            </div>
            <div className={s.gate}>
              <div className={[home.panel, home.panelTight, home.panelBlaze, s.gateTile].join(" ")}>
                <span className={s.gateNum}>{gate.bar}</span>
                <b>Its bar, out of 100</b>
                <span>A result has to score at least this, with no failed check, to be marked ready.</span>
              </div>
              <div className={[home.panel, home.panelTight, s.gateTile].join(" ")}>
                <span className={s.gateNum}>{gate.rewrites}</span>
                <b>Rewrites at most</b>
                <span>{gate.rewrites ? `Under the bar, WOVI sends it back with the reasons, ${times(gate.rewrites)} at most, then to you for review.` : "Under the bar, it goes to you for review."}</span>
              </div>
              <div className={[home.panel, home.panelTight, home.panelCobalt, s.gateTile].join(" ")}>
                <span className={s.gateIcon}>
                  <Icon name="check-circle" size={34} />
                </span>
                <b>You approve</b>
                <span>A person says yes before anything is posted. WOVI never posts for you.</span>
              </div>
            </div>
            {gate.guardrails.length > 0 && (
              <div className={s.rules}>
                <span className={s.rulesLabel}>Its own rules</span>
                {gate.guardrails.map((g) => (
                  <span key={g} className={home.chip}>
                    {g}
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* 7. Chain it */}
        <section className={home.section} aria-labelledby="chain-title">
          <div className="container">
            <div className={home.head}>
              <span className="eyebrow">Chain it</span>
              <h2 id="chain-title" className={home.title}>
                {chains.length ? "Or let it hand off to the next agent." : "Use it on its own, then pass it on."}
              </h2>
              <p className={home.lead}>
                {chains.length
                  ? `${agent.name} is a step in ${chains.length === 1 ? "a ready-made chain" : `${chains.length} ready-made chains`}. Each agent passes its work to the next, and you pick and approve along the way.`
                  : `${agent.name} is not in a ready-made chain yet. Take what it gives you into one of these agents.`}
              </p>
            </div>
            {chains.length > 0 ? (
              <div className={[s.chainGrid, chains.length === 1 ? s.chainOne : chains.length === 2 ? s.chainTwo : ""].join(" ")}>
                {chains.map((c, i) => (
                  <article key={c.id} className={[home.panel, home.panelTight, i % 2 ? home.panelAlt : "", s.chain].join(" ")}>
                    <div className={s.chainCopy}>
                      <span className={[home.iconTile, home.iconTileBlaze].join(" ")}>
                        <Icon name="layers" size={22} />
                      </span>
                      <h3 className={s.cardTitle}>{c.name}</h3>
                      <p className={s.cardText}>{c.job}</p>
                    </div>
                    <ol className={s.steps} aria-label="The steps">
                      {c.steps.map((st, j) => (
                        <li key={`${st.agentId}-${j}`} className={[s.step, st.agentId === agent.id ? s.stepOn : ""].join(" ")}>
                          <span className={s.stepNo}>{j + 1}</span>
                          <span className={s.stepName}>{st.agentName}</span>
                          <span className={s.stepLabel}>{st.label}</span>
                        </li>
                      ))}
                    </ol>
                    <div className={s.chainFoot}>
                      <ButtonLink href={`/app/pipelines/${c.id}`} variant="secondary" size="sm" trailing={<Icon name="arrow-right" size={16} />}>
                        Start this chain
                      </ButtonLink>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className={[s.chainGrid, s.chainTwo].join(" ")}>
                {[
                  { id: "idea-generator", name: "Idea Generator", text: "Turn what it found into a week of post ideas." },
                  { id: "hook-writer", name: "Hook Writer", text: "Write the opening line for the post you picked." },
                ]
                  .filter((n) => n.id !== agent.id)
                  .map((n, i) => (
                  <Link key={n.id} href={`/agents/${n.id}`} className={s.nextLink}>
                    <article className={[home.panel, home.panelTight, i % 2 ? home.panelAlt : "", s.chain].join(" ")}>
                      <span className={home.iconTile}>
                        <Icon name={agentIcon(n.id)} size={22} />
                      </span>
                      <h3 className={s.cardTitle}>{n.name}</h3>
                      <p className={s.cardText}>{n.text}</p>
                      <span className={s.more}>
                        See {n.name} <Icon name="arrow-right" size={16} />
                      </span>
                    </article>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* 8. Closing */}
        <section className={s.closing} aria-labelledby="use-title">
          <div className="container">
            <div className={[home.panel, home.panelCobalt, closing.cta].join(" ")}>
              <div className={closing.ctaCopy}>
                <span className={[home.panelLabel, closing.ctaLabel].join(" ")}>Ready when you are</span>
                <h2 id="use-title" className={closing.ctaTitle}>
                  Put {agent.name} to work on your brand.
                </h2>
                <p className={closing.ctaLead}>Sign in with your email, set up your Brand Brain once, and fill in the form. You pay per run with credits, and every result waits for your yes.</p>
                <div className={closing.ctaActions}>
                  <ButtonLink href={useHref(agent.id)} size="lg" className={closing.ctaButton} trailing={<Icon name="arrow-right" />}>
                    {use}
                  </ButtonLink>
                  <ButtonLink href="/agents" size="lg" variant="ghost" className={closing.ctaGhost}>
                    See all agents
                  </ButtonLink>
                </div>
              </div>
              <div className={closing.ctaWovi}>
                <Sparkle size={26} color="#FFF4DC" className={closing.ctaSparkle} />
                <Mascot pose="hello" size={240} ink="cream" label="Wovi waving" className={closing.ctaMascot} />
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
