/**
 * Storage for accounts, behind one small interface like the agent and run
 * stores. Each table is a Collection with equality filters and one
 * conditional update, which map straight onto SQL:
 *
 *   find({ userId })                    SELECT ... WHERE user_id = $1
 *   updateIf(id, { usedAt: null }, p)   UPDATE ... SET ... WHERE id = $1 AND used_at IS NULL RETURNING *
 *
 * A Postgres store implements the same interface with unique indexes on
 * users.email, sessions.token_hash, api_keys.key_hash, invites.token_hash and
 * sign_in_requests.token_hash. Nothing else changes.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
  ApiKey,
  Challenge,
  Creator,
  Invite,
  Member,
  Passkey,
  RateBucket,
  Session,
  SignInRequest,
  User,
  WalletLink,
  Workspace,
} from "./types";

export interface Collection<T extends { id: string }> {
  get(id: string): Promise<T | null>;
  /** Rows whose fields equal every given value. All rows when empty. */
  find(where?: Partial<T>): Promise<T[]>;
  /** Refuses an id that exists. */
  insert(row: T): Promise<void>;
  /** Refuses an id that does not exist. */
  update(row: T): Promise<void>;
  /** Applies the patch only while the row still matches `where`, in one step. Null when it did not match. */
  updateIf(id: string, where: Partial<T>, patch: Partial<T>): Promise<T | null>;
  delete(id: string): Promise<boolean>;
}

export type AccountStore = {
  users: Collection<User>;
  workspaces: Collection<Workspace>;
  members: Collection<Member>;
  invites: Collection<Invite>;
  signInRequests: Collection<SignInRequest>;
  sessions: Collection<Session>;
  apiKeys: Collection<ApiKey>;
  passkeys: Collection<Passkey>;
  wallets: Collection<WalletLink>;
  challenges: Collection<Challenge>;
  creators: Collection<Creator>;
  rateLimits: Collection<RateBucket>;
};

const TABLES = [
  "users",
  "workspaces",
  "members",
  "invites",
  "signInRequests",
  "sessions",
  "apiKeys",
  "passkeys",
  "wallets",
  "challenges",
  "creators",
  "rateLimits",
] as const satisfies readonly (keyof AccountStore)[];

type Row = { id: string };
type Data = Record<(typeof TABLES)[number], Row[]>;

const clone = <T>(v: T): T => structuredClone(v);

function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => (row as Record<string, unknown>)[k] === v);
}

/** Every call reads, changes and writes in one synchronous step, so calls never interleave inside one process. */
function collection<T extends Row>(read: () => Data, write: (data: Data) => void, table: keyof Data): Collection<T> {
  const rows = (data: Data) => data[table] as T[];
  return {
    async get(id) {
      const row = rows(read()).find((r) => r.id === id);
      return row ? clone(row) : null;
    },
    async find(where = {}) {
      return clone(rows(read()).filter((r) => matches(r, where)));
    },
    async insert(row) {
      const data = read();
      if (rows(data).some((r) => r.id === row.id)) throw new Error(`${table}: ${row.id} already exists.`);
      rows(data).push(clone(row));
      write(data);
    },
    async update(row) {
      const data = read();
      const i = rows(data).findIndex((r) => r.id === row.id);
      if (i === -1) throw new Error(`${table}: ${row.id} does not exist.`);
      rows(data)[i] = clone(row);
      write(data);
    },
    async updateIf(id, where, patch) {
      const data = read();
      const i = rows(data).findIndex((r) => r.id === id);
      if (i === -1 || !matches(rows(data)[i], where)) return null;
      const next = { ...rows(data)[i], ...clone(patch), id };
      rows(data)[i] = next;
      write(data);
      return clone(next);
    },
    async delete(id) {
      const data = read();
      const i = rows(data).findIndex((r) => r.id === id);
      if (i === -1) return false;
      rows(data).splice(i, 1);
      write(data);
      return true;
    },
  };
}

function build(read: () => Data, write: (data: Data) => void): AccountStore {
  return Object.fromEntries(TABLES.map((t) => [t, collection(read, write, t)])) as unknown as AccountStore;
}

const empty = (): Data => Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as Data;

/** In memory. Used by tests. */
export function memoryAccountStore(): AccountStore {
  const data = empty();
  return build(
    () => data,
    () => undefined,
  );
}

/**
 * One JSON file on disk, for local work. Writes go through a temp file and a
 * rename, so a crash never leaves half a file. One process only.
 */
export function jsonFileAccountStore(file: string): AccountStore {
  const read = (): Data => {
    try {
      return { ...empty(), ...(JSON.parse(readFileSync(file, "utf8")) as Partial<Data>) };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return empty();
      throw err;
    }
  };
  const write = (data: Data) => {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
    renameSync(tmp, file);
  };
  return build(read, write);
}
