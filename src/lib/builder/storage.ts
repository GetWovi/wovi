/**
 * Files the builder keeps: sample uploads and mood board images. Everything
 * goes through the small FileStorage interface, so the local folder store in
 * .data/files/ can be swapped for object storage without touching the
 * builder. Every file carries its workspace id and is only served back to
 * that workspace.
 *
 * Limits live here as data: what kinds of files are accepted and how big.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { newId } from "@/lib/accounts/crypto";

export type StoredFile = {
  id: string;
  workspaceId: string;
  /** The original name, cleaned. */
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export type FileKind = "image" | "text";

export const FILE_LIMITS: Record<FileKind, { maxBytes: number; types: readonly string[]; extensions: readonly string[] }> = {
  image: { maxBytes: 8 * 1024 * 1024, types: ["image/png", "image/jpeg", "image/webp", "image/gif"], extensions: [".png", ".jpg", ".jpeg", ".webp", ".gif"] },
  text: { maxBytes: 2 * 1024 * 1024, types: ["text/plain", "text/markdown", "text/csv", "application/json"], extensions: [".txt", ".md", ".csv", ".json"] },
};

export const MAX_FILE_NAME = 120;

/** Strips paths and odd characters from a file name. */
export function cleanFileName(name: unknown): string {
  const base = (typeof name === "string" ? name : "file").split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[^\w.\- ()]+/g, "_").trim().slice(0, MAX_FILE_NAME);
  return cleaned || "file";
}

/** Null when the file is allowed, or the reason it is not. */
export function checkFile(kind: FileKind, file: { name: string; mimeType: string; sizeBytes: number }): string | null {
  const limit = FILE_LIMITS[kind];
  if (file.sizeBytes <= 0) return "The file is empty.";
  if (file.sizeBytes > limit.maxBytes) return `"${file.name}" is ${(file.sizeBytes / 1024 / 1024).toFixed(1)} MB; the limit for ${kind} files is ${limit.maxBytes / 1024 / 1024} MB.`;
  const mime = file.mimeType.toLowerCase().split(";")[0].trim();
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  if (!limit.types.includes(mime) && !limit.extensions.includes(ext)) {
    return `"${file.name}" is not an accepted ${kind} file. Accepted: ${limit.extensions.join(", ")}.`;
  }
  return null;
}

export interface FileStorage {
  put(workspaceId: string, file: { name: string; mimeType: string; bytes: Uint8Array }): Promise<StoredFile>;
  get(workspaceId: string, id: string): Promise<{ meta: StoredFile; bytes: Uint8Array } | null>;
  delete(workspaceId: string, id: string): Promise<boolean>;
}

const FILE_ID = /^fil_[a-f0-9]{20}$/;
const WS = /^[a-z0-9][a-z0-9_-]{1,63}$/;

function meta(workspaceId: string, file: { name: string; mimeType: string; bytes: Uint8Array }, now: () => string): StoredFile {
  return { id: newId("fil"), workspaceId, name: cleanFileName(file.name), mimeType: file.mimeType, sizeBytes: file.bytes.byteLength, createdAt: now() };
}

/** In memory. For tests. */
export function memoryFileStorage(now: () => string = () => new Date().toISOString()): FileStorage {
  const files = new Map<string, { meta: StoredFile; bytes: Uint8Array }>();
  return {
    async put(workspaceId, file) {
      const m = meta(workspaceId, file, now);
      files.set(m.id, { meta: m, bytes: new Uint8Array(file.bytes) });
      return m;
    },
    async get(workspaceId, id) {
      const f = files.get(id);
      return f && f.meta.workspaceId === workspaceId ? { meta: f.meta, bytes: new Uint8Array(f.bytes) } : null;
    },
    async delete(workspaceId, id) {
      const f = files.get(id);
      if (!f || f.meta.workspaceId !== workspaceId) return false;
      return files.delete(id);
    },
  };
}

/**
 * A folder per workspace under `dir`, one file plus one .json of metadata
 * each. Ids and workspace ids are checked against a strict pattern before
 * they touch a path.
 */
export function localFileStorage(dir: string, now: () => string = () => new Date().toISOString()): FileStorage {
  const pathFor = (workspaceId: string, id: string) => {
    if (!WS.test(workspaceId) || !FILE_ID.test(id)) throw new Error("Bad file id.");
    return join(dir, workspaceId, id);
  };
  return {
    async put(workspaceId, file) {
      const m = meta(workspaceId, file, now);
      const path = pathFor(workspaceId, m.id);
      mkdirSync(join(dir, workspaceId), { recursive: true });
      writeFileSync(path, file.bytes, { mode: 0o600 });
      writeFileSync(`${path}.json`, JSON.stringify(m) + "\n", { mode: 0o600 });
      return m;
    },
    async get(workspaceId, id) {
      if (!WS.test(workspaceId) || !FILE_ID.test(id)) return null;
      const path = pathFor(workspaceId, id);
      try {
        const m = JSON.parse(readFileSync(`${path}.json`, "utf8")) as StoredFile;
        if (m.workspaceId !== workspaceId) return null;
        return { meta: m, bytes: new Uint8Array(readFileSync(path)) };
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },
    async delete(workspaceId, id) {
      if (!WS.test(workspaceId) || !FILE_ID.test(id)) return false;
      const path = pathFor(workspaceId, id);
      const had = (await this.get(workspaceId, id)) !== null;
      rmSync(path, { force: true });
      rmSync(`${path}.json`, { force: true });
      return had;
    },
  };
}
