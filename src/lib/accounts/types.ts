/**
 * The account records. Identity records (users, sessions, sign-in requests,
 * passkeys, wallets) belong to a person, not a workspace. Everything a
 * workspace owns (members, invites, API keys, creators) carries its
 * workspaceId, like agents and runs already do.
 */
import type { Role } from "./policy";

export type User = {
  id: string;
  /** Lowercased and trimmed. One user per address. */
  email: string;
  name: string | null;
  /** Made at sign-up. The session falls back to it. */
  personalWorkspaceId: string;
  createdAt: string;
  updatedAt: string;
};

export type Workspace = {
  id: string;
  name: string;
  personal: boolean;
  /** Plans and seats arrive with billing (phase 13). Everything is "free" until then. */
  plan: "free";
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Member = {
  /** `${workspaceId}:${userId}` */
  id: string;
  workspaceId: string;
  userId: string;
  role: Role;
  invitedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Invite = {
  id: string;
  workspaceId: string;
  email: string;
  role: Role;
  /** sha256 of the token in the invite link. The token itself is only in the email. */
  tokenHash: string;
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  acceptedBy: string | null;
  revokedAt: string | null;
};

/** One email sign-in: a link and a code that are used up together. */
export type SignInRequest = {
  id: string;
  email: string;
  /** sha256 of the link token. */
  tokenHash: string;
  /** HMAC of the six-digit code with the server secret. */
  codeHash: string;
  /** A local path to land on after sign-in. */
  next: string | null;
  attempts: number;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
};

export type SessionMethod = "email" | "passkey";

export type Session = {
  /** Public id, safe to show and log. The token is never stored. */
  id: string;
  /** sha256 of the cookie token. */
  tokenHash: string;
  /** The token before the last rotation, accepted until prevValidUntil so parallel requests do not fail. */
  prevTokenHash: string | null;
  prevValidUntil: string | null;
  userId: string;
  /** The current workspace. One per session. */
  workspaceId: string;
  method: SessionMethod;
  userAgent: string | null;
  createdAt: string;
  rotatedAt: string;
  lastSeenAt: string;
  /** Absolute end, no matter how active. */
  expiresAt: string;
};

export type ApiKey = {
  id: string;
  workspaceId: string;
  name: string;
  /** The first characters of the key, for telling keys apart. */
  prefix: string;
  /** sha256 of the full key. */
  keyHash: string;
  role: Exclude<Role, "owner">;
  createdBy: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type Passkey = {
  /** The WebAuthn credential id, base64url. */
  id: string;
  userId: string;
  /** COSE public key, base64url. */
  publicKey: string;
  counter: number;
  transports: string[];
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export type WalletLink = {
  /** The address in lowercase, so one wallet links to one account. */
  id: string;
  userId: string;
  /** Checksummed. */
  address: string;
  chainId: number;
  linkedAt: string;
};

export type ChallengeKind = "passkey_register" | "passkey_auth" | "wallet_link";

/** A short-lived, single-use value a browser or wallet signs. */
export type Challenge = {
  id: string;
  kind: ChallengeKind;
  userId: string | null;
  /** The WebAuthn challenge, or the exact message a wallet signs. */
  value: string;
  /** For wallet links: the address the message names. */
  address: string | null;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
};

/** A creator account. Agents name one as their owner. */
export type Creator = {
  id: string;
  workspaceId: string;
  kind: "platform" | "creator";
  name: string;
  createdAt: string;
};

export type RateBucket = { id: string; count: number; resetAt: string };
