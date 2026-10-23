/**
 * Files the builder keeps: sample uploads and mood board images. Everything
 * goes through the small FileStorage interface, so the local folder store in
 * .data/files/ can be swapped for object storage without touching the
 * builder. Every file carries its workspace id and is only served back to
 * that workspace.
 *
 * Limits live here as data: what kinds of files are accepted and how big.
 */
import { createWriteStream, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
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

export type FileKind = "image" | "text" | "video";

export const FILE_LIMITS: Record<FileKind, { maxBytes: number; types: readonly string[]; extensions: readonly string[] }> = {
  image: { maxBytes: 8 * 1024 * 1024, types: ["image/png", "image/jpeg", "image/webp", "image/gif"], extensions: [".png", ".jpg", ".jpeg", ".webp", ".gif"] },
  text: { maxBytes: 2 * 1024 * 1024, types: ["text/plain", "text/markdown", "text/csv", "application/json"], extensions: [".txt", ".md", ".csv", ".json"] },
  // Clip samples (src/lib/clips): streamed to disk through putStream, never held whole in memory. The length limit is in src/lib/clips/config.ts.
  video: { maxBytes: 200 * 1024 * 1024, types: ["video/mp4", "video/quicktime", "video/webm"], extensions: [".mp4", ".mov", ".webm", ".m4v"] },
};

/** Thrown by putStream when the bytes run past the limit or the first bytes are not the kind of file named. */
export class UploadRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadRefused";
  }
}

export type StreamUpload = {
  name: string;
  mimeType: string;
  /** The bytes as they arrive. */
  stream: AsyncIterable<Uint8Array>;
  /** Stops the upload and removes the part written once the bytes pass this. */
  maxBytes: number;
  /** Reads the first bytes (at least 16, or all of a smaller file): a reason to refuse, or null. */
  sniff?: (head: Uint8Array) => string | null;
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
  if (kind === "video") {
    // A clip must say it is a video by its type or its name; a renamed text file is caught by the sniff on the first bytes.
    const mime = file.mimeType.toLowerCase().split(";")[0].trim();
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
    if (!limit.extensions.includes(ext) && !limit.types.includes(mime)) return `"${file.name}" is not a clip WOVI reads. Accepted: MP4, MOV or WebM.`;
    return null;
  }
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
  /** Writes a file as its bytes arrive, so a large upload is never held whole in memory. Stores that cannot stream leave it out. */
  putStream?(workspaceId: string, file: StreamUpload): Promise<StoredFile>;
  /** The metadata only, without reading the bytes. */
  head?(workspaceId: string, id: string): Promise<StoredFile | null>;
  /** The file's path on disk, for tools like ffmpeg and for streaming it back. Null when it is not on disk. */
  pathOf?(workspaceId: string, id: string): string | null;
}

/** Collects a stream with the same limits as putStream. For the memory store and tests. */
async function collect(file: StreamUpload): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let size = 0;
  let sniffed = false;
  let head: Uint8Array = new Uint8Array(0);
  for await (const chunk of file.stream) {
    size += chunk.byteLength;
    if (size > file.maxBytes) throw new UploadRefused(`"${cleanFileName(file.name)}" is larger than ${Math.round(file.maxBytes / 1024 / 1024)} MB.`);
    parts.push(chunk);
    if (!sniffed && file.sniff) {
      head = concat([head, chunk]);
      if (head.byteLength >= 16) {
        sniffed = true;
        const why = file.sniff(head);
        if (why) throw new UploadRefused(why);
      }
    }
  }
  if (!sniffed && file.sniff) {
    const why = file.sniff(head);
    if (why) throw new UploadRefused(why);
  }
  return concat(parts);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
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
    async putStream(workspaceId, file) {
      return this.put(workspaceId, { name: file.name, mimeType: file.mimeType, bytes: await collect(file) });
    },
    async head(workspaceId, id) {
      const f = files.get(id);
      return f && f.meta.workspaceId === workspaceId ? f.meta : null;
    },
    pathOf() {
      return null;
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
      const had = (await this.head!(workspaceId, id)) !== null;
      rmSync(path, { force: true });
      rmSync(`${path}.json`, { force: true });
      return had;
    },
    async head(workspaceId, id) {
      if (!WS.test(workspaceId) || !FILE_ID.test(id)) return null;
      try {
        const m = JSON.parse(readFileSync(`${pathFor(workspaceId, id)}.json`, "utf8")) as StoredFile;
        return m.workspaceId === workspaceId ? m : null;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },
    pathOf(workspaceId, id) {
      if (!WS.test(workspaceId) || !FILE_ID.test(id)) return null;
      return pathFor(workspaceId, id);
    },
    async putStream(workspaceId, file) {
      const id = newId("fil");
      const path = pathFor(workspaceId, id);
      const part = `${path}.part`;
      mkdirSync(join(dir, workspaceId), { recursive: true });
      const out = createWriteStream(part, { mode: 0o600 });
      const failed = new Promise<never>((_, reject) => out.once("error", reject));
      failed.catch(() => undefined);
      let size = 0;
      let head: Uint8Array = new Uint8Array(0);
      let sniffed = !file.sniff;
      try {
        for await (const chunk of file.stream) {
          size += chunk.byteLength;
          if (size > file.maxBytes) throw new UploadRefused(`"${cleanFileName(file.name)}" is larger than ${Math.round(file.maxBytes / 1024 / 1024)} MB.`);
          if (!sniffed) {
            head = concat([head, chunk.subarray(0, 64)]);
            if (head.byteLength >= 16) {
              sniffed = true;
              const why = file.sniff!(head);
              if (why) throw new UploadRefused(why);
            }
          }
          // Wait for the disk when the buffer is full, so memory stays flat however large the file.
          if (!out.write(chunk)) await Promise.race([new Promise<void>((r) => out.once("drain", () => r())), failed]);
        }
        if (!sniffed) {
          const why = file.sniff!(head);
          if (why) throw new UploadRefused(why);
        }
        if (size === 0) throw new UploadRefused("The file is empty.");
        await Promise.race([new Promise<void>((r) => out.end(r)), failed]);
        renameSync(part, path);
      } catch (err) {
        out.destroy();
        rmSync(part, { force: true });
        throw err;
      }
      const m: StoredFile = { id, workspaceId, name: cleanFileName(file.name), mimeType: file.mimeType, sizeBytes: size, createdAt: now() };
      writeFileSync(`${path}.json`, JSON.stringify(m) + "\n", { mode: 0o600 });
      return m;
    },
  };
}
