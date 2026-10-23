/**
 * The Next.js side of clip samples: one library per process on the app's
 * builder and the process queue. The queue itself is started from
 * instrumentation; the first use starts it too, in case it was not.
 */
import { appBuilder } from "@/lib/builder/server";
import type { ClipLibrary } from "./library";
import { localClipLibrary, processClipQueue } from "./local";

const g = globalThis as { __woviClips?: ClipLibrary };

export function appClips(): ClipLibrary {
  if (!g.__woviClips) {
    g.__woviClips = localClipLibrary(appBuilder());
    const q = processClipQueue();
    if (q.config.enabled) void q.start().catch((err) => console.error("Could not start the clip queue:", err));
  }
  return g.__woviClips;
}
