import { describe, expect, it } from "vitest";
import { ROBINHOOD_CHAIN_HEX, toRobinhoodChain, type Eip1193 } from "./wallet-browser";

/** A wallet on another chain whose switch fails with `failure`; it records every method asked. */
function wallet(failure: unknown) {
  const asked: string[] = [];
  const eth: Eip1193 = {
    async request({ method }: { method: string }) {
      asked.push(method);
      if (method === "eth_chainId") return "0x1";
      if (method === "wallet_switchEthereumChain") throw failure;
      return null;
    },
  } as Eip1193;
  return { eth, asked };
}

describe("toRobinhoodChain", () => {
  it("adds the chain when the wallet does not know it, on desktop and on a phone", async () => {
    for (const failure of [{ code: 4902 }, { code: -32603, data: { originalError: { code: 4902 } } }]) {
      const { eth, asked } = wallet(failure);
      await toRobinhoodChain(eth);
      expect(asked).toEqual(["eth_chainId", "wallet_switchEthereumChain", "wallet_addEthereumChain"]);
    }
  });

  it("passes any other refusal on, and does nothing on Robinhood Chain", async () => {
    const { eth, asked } = wallet({ code: 4001 });
    await expect(toRobinhoodChain(eth)).rejects.toEqual({ code: 4001 });
    expect(asked).not.toContain("wallet_addEthereumChain");
    const here: Eip1193 = { request: async () => ROBINHOOD_CHAIN_HEX } as Eip1193;
    await expect(toRobinhoodChain(here)).resolves.toBeUndefined();
  });
});
