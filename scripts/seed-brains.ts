/**
 * Puts the example Brand Brains into the platform workspace (or the one
 * given), so the builder's test bench has Brand Brains to pick from. Local
 * only, safe to run again: a name the workspace already has is skipped.
 *
 *   npm run brains:seed
 *   npm run brains:seed -- ws_xxxxxxxx
 */
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { dataDirFromEnv } from "@/lib/accounts/local";
import { PLATFORM_WORKSPACE_ID } from "@/lib/agents/seeds";
import { seedBrains } from "@/lib/brand/seeds";
import { jsonFileBrandStore } from "@/lib/brand/store";
import { localFileStorage } from "@/lib/builder/storage";

/** A soft two-light gradient as a PNG, drawn here so the example mood board has images without any download. */
function gradientPng(w: number, h: number, base: [number, number, number], glow: [number, number, number], at: [number, number]): Uint8Array {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  let seed = 7;
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x / w - at[0], (y / h - at[1]) * 0.8);
      const t = Math.max(0, 1 - d * 1.4) ** 1.6;
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const grain = ((seed >> 16) % 9) - 4;
      for (let c = 0; c < 3; c++) raw[y * (w * 3 + 1) + 1 + x * 3 + c] = Math.max(0, Math.min(255, Math.round(base[c] + (glow[c] - base[c]) * t + grain)));
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}

async function main() {
  const dataDir = dataDirFromEnv();
  const workspaceId = process.argv[2] ?? PLATFORM_WORKSPACE_ID;
  const images = {
    "crust.png": gradientPng(640, 480, [58, 30, 16], [196, 120, 62], [0.35, 0.4]),
    "morning.png": gradientPng(640, 480, [92, 74, 52], [255, 236, 196], [0.75, 0.2]),
  };
  const made = await seedBrains(jsonFileBrandStore(join(dataDir, "brand-brains.json")), localFileStorage(join(dataDir, "files")), workspaceId, { images });
  console.log(made.length ? `Added to ${workspaceId}: ${made.join(", ")}.` : `${workspaceId} already has the example Brand Brains.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
