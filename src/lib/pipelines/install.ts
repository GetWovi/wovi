/**
 * Installs the pipeline templates into the platform workspace, as the launch
 * author, through GuardedPipelines. Safe to run again, and safe after
 * builders changed a template: a missing template is created; one is saved
 * at the template's version only when that version is newer than every
 * saved one and nobody but the launch author has saved it; otherwise it is
 * left alone and the report says why. Needs the launch agents first.
 */
import type { Principal } from "@/lib/accounts/accounts";
import { PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import { compareSemver, highestSemver } from "@/lib/agents/semver";
import { PipelineError } from "./errors";
import type { GuardedPipelines } from "./guard";
import { PIPELINE_TEMPLATES, TEMPLATE_NOTE } from "./templates";

export type TemplateAction = "created" | "updated" | "unchanged" | "kept";
export type TemplateReport = { id: string; name: string; action: TemplateAction; version: string; reason: string | null }[];

export async function installPipelineTemplates(pipelines: GuardedPipelines, me: Principal, authorId: string): Promise<TemplateReport> {
  const ws = PLATFORM_WORKSPACE_ID;
  const report: TemplateReport = [];
  for (const t of PIPELINE_TEMPLATES) {
    const current = await pipelines.get(me, ws, t.id);
    if (!current) {
      const made = await pipelines.create(me, ws, t, { note: TEMPLATE_NOTE });
      report.push({ id: t.id, name: made.name, action: "created", version: made.version, reason: null });
      continue;
    }
    const versions = await pipelines.versions(me, ws, t.id);
    const highest = highestSemver(versions.map((v) => v.version)) ?? "0.0.0";
    const people = versions.filter((v) => v.by !== null && v.by !== authorId);
    if (compareSemver(t.version, highest) < 0) {
      report.push({ id: t.id, name: current.name, action: "kept", version: current.version, reason: `version ${highest} is newer than the template version ${t.version}` });
    } else if (compareSemver(t.version, highest) === 0) {
      report.push({ id: t.id, name: current.name, action: "unchanged", version: current.version, reason: null });
    } else if (people.length) {
      report.push({ id: t.id, name: current.name, action: "kept", version: current.version, reason: `edited in the builder since (version ${people[people.length - 1].version})` });
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, owner, status, visibility, ...body } = t;
      let saved;
      try {
        saved = await pipelines.update(me, ws, t.id, body, { note: TEMPLATE_NOTE });
      } catch (err) {
        // Same body under a new number: nothing to save.
        if (err instanceof PipelineError && err.code === "no_change") {
          report.push({ id: t.id, name: current.name, action: "unchanged", version: current.version, reason: null });
          continue;
        }
        throw err;
      }
      if (status && saved.status !== status) await pipelines.setStatus(me, ws, t.id, status);
      report.push({ id: t.id, name: saved.name, action: "updated", version: saved.version, reason: null });
    }
  }
  return report;
}
