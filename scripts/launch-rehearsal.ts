/**
 * The $WOVI launch, rehearsed on a local fork of Robinhood Chain with the launch page's own server pieces
 * (src/lib/token/launch*.ts). scripts/launch-rehearsal.sh starts the fork, deploys the burn pot and the splitter
 * with contracts/token-deploy.sh and calls this in three steps:
 *
 *   tsx scripts/launch-rehearsal.ts before   every refusal the page makes, and the page's call against the forge script's
 *   tsx scripts/launch-rehearsal.ts launch   the page's server builds the call; the launcher sends exactly that,
 *                                            impersonated on the fork (Funkai pressing the button)
 *   tsx scripts/launch-rehearsal.ts after    the token, the dev buy, the tax, trades, the split to the wei, a burn,
 *                                            and a second launch and another wallet both refused
 *
 * It reads the same settings the site does (WOVI_TOKEN_RPC_URL, WOVI_BURN_POT_ADDRESS, WOVI_SPLITTER_ADDRESS,
 * WOVI_LAUNCH_OPENING_BUY_WEI) plus FORK_LAUNCHER. It refuses any node that is not a local fork. No key anywhere:
 * every wallet here is impersonated by the fork.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, createTestClient, createWalletClient, decodeEventLog, encodeFunctionData, http, parseAbi, parseEther, type Address, type Hex } from "viem";
import { ROBINHOOD_CHAIN } from "@/lib/token/chain";
import { launchOutcome, launchStatus, prepareLaunch } from "@/lib/token/launch";
import { decodeRevert } from "@/lib/token/launch-plan";
import { launchDeps, LAUNCH_FILE } from "@/lib/token/launch-server";

const RPC = process.env.WOVI_TOKEN_RPC_URL ?? "";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(RPC)) throw new Error("WOVI_TOKEN_RPC_URL must be the local fork, http://127.0.0.1:<port>");
const POT = process.env.WOVI_BURN_POT_ADDRESS as Address;
const SPLITTER = process.env.WOVI_SPLITTER_ADDRESS as Address;
const LAUNCHER = process.env.FORK_LAUNCHER as Address;
const BUY = BigInt(process.env.WOVI_LAUNCH_OPENING_BUY_WEI ?? "0");
const STATE = process.env.FORK_STATE ?? "/tmp/wovi-launch-rehearsal.json";
// Throwaway wallets on the fork only, impersonated: nobody holds a key to them.
const STRANGER = "0x5ec0000000000000000000000000000000057a9e" as Address;
const TRADER = "0x7ad3000000000000000000000000000000007ad3" as Address;
const KEEPER = "0x6ee9000000000000000000000000000000006ee9" as Address;
const FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e" as Address;

const chain = { ...ROBINHOOD_CHAIN, rpcUrls: { default: { http: [RPC] } } };
const pub = createPublicClient({ chain, transport: http(RPC) });
const test = createTestClient({ chain, mode: "anvil", transport: http(RPC) });
const wallet = createWalletClient({ chain, transport: http(RPC) });

const POT_ABI = parseAbi([
  "function token() view returns (address)",
  "function launcher() view returns (address)",
  "function openingBuyEth() view returns (uint256)",
  "function openingBuyTokens() view returns (uint256)",
  "function burn(uint256 minTokensOut) returns (uint256 ethIn, uint256 tokensBurned)",
  "function preview() view returns (uint256 amount, uint256 nextAt, bool ready, uint256 tokens)",
  "event Burned(uint256 indexed n, address indexed caller, uint256 ethIn, uint256 tokensBurned, bool viaCurve)",
]);
const SPLITTER_ABI = parseAbi([
  "function owner() view returns (address)",
  "function ownerBps() view returns (uint16)",
  "function burnBps() view returns (uint16)",
  "function sweep() returns (uint256 amount)",
  "event Split(uint256 amount, uint256 toOwner, uint256 toBurn, bool ownerPushed, bool burnPushed)",
]);
const TOKEN_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
]);
const CURVE_ABI = parseAbi([
  "function buy(uint256 quoteIn, uint256 minTokensOut, address recipient) payable returns (uint256)",
  "function sell(uint256 tokensIn, uint256 minQuoteOut, address recipient) returns (uint256)",
  "event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax)",
  "event CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax)",
]);
const FACTORY_ABI = parseAbi([
  "struct LaunchedToken { address token; address curve; address deployer; address creatorFeeRecipient; address pairToken; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing; uint16 creatorTaxBps; bool buybackEnabled; uint8 phase; uint256 sweptQuote; uint256 sweptTokens; uint256 sweptAt; bool exists; }",
  "function getLaunchedToken(address token) view returns (LaunchedToken)",
]);

let failures = 0;
function ok(cond: boolean, what: string, detail = "") {
  console.log(`  ${cond ? "OK  " : "FAIL"} ${what}${detail ? `: ${detail}` : ""}`);
  if (!cond) failures++;
}
const eth = (wei: bigint) => {
  const s = wei.toString().padStart(19, "0");
  return `${s.slice(0, -18)}.${s.slice(-18)}`.replace(/\.?0+$/, "") || "0";
};
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Sends as `from` on the fork with no key: the fork answers for an impersonated wallet. */
async function sendAs(from: Address, tx: { to: Address; data?: Hex; value?: bigint; gas?: bigint }) {
  await test.impersonateAccount({ address: from });
  try {
    const hash = await wallet.sendTransaction({ account: from, chain, to: tx.to, data: tx.data, value: tx.value ?? BigInt(0), gas: tx.gas });
    const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
    return { hash, receipt };
  } finally {
    await test.stopImpersonatingAccount({ address: from });
  }
}

async function before() {
  console.log("== The page's checks, before the launch");
  const chainId = await pub.getChainId();
  ok(chainId === 4663, "the fork answers as Robinhood Chain", String(chainId));
  ok(same(await pub.readContract({ address: POT, abi: POT_ABI, functionName: "launcher" }), LAUNCHER), "the burn pot's launcher is the launch wallet", LAUNCHER);

  // Too little ETH: the page says how much is missing.
  await test.setBalance({ address: LAUNCHER, value: parseEther("0.001") });
  const short = await prepareLaunch(launchDeps(), LAUNCHER);
  ok(!short.ok && short.kind === "short" && BigInt(short.missingWei ?? "0") > BigInt(0), "a launch wallet without enough ETH is refused, with what is missing", !short.ok ? `${short.problem} (${eth(BigInt(short.missingWei ?? "0"))} ETH)` : "");

  await test.setBalance({ address: LAUNCHER, value: parseEther("1") });
  await test.setBalance({ address: STRANGER, value: parseEther("1") });
  const status = await launchStatus(launchDeps());
  ok(status.kind === "ready", "the page is ready", status.kind === "ready" ? `dev buy ${eth(BigInt(status.summary.openingBuyWei))} ETH, fee ${eth(BigInt(status.summary.launchFeeWei))} ETH, total ${eth(BigInt(status.summary.totalWei))} ETH` : JSON.stringify(status));

  const wrong = await prepareLaunch(launchDeps(), STRANGER);
  ok(!wrong.ok && wrong.kind === "wrong_wallet" && wrong.problem === "This wallet is not the launch wallet.", "another wallet is refused", !wrong.ok ? `${wrong.problem} (${wrong.connected} vs ${wrong.launcher})` : "");

  const p = await prepareLaunch(launchDeps(), LAUNCHER.toLowerCase());
  if (!p.ok) throw new Error(`the page refused the launch wallet: ${p.problem}`);
  ok(true, "the page's server built the launch and ran it on the fork from the launcher", `predicted token ${p.predictedToken}, gas ${BigInt(p.tx.gas)}`);
  ok(BigInt(p.tx.value) === BigInt(status.kind === "ready" ? status.summary.totalWei : "0"), "value = Pons' launch fee + the dev buy", `${BigInt(p.tx.value)} wei`);

  // The same call from another wallet, sent for real: it must revert NotLauncher.
  const sim = await launchDeps().reader.simulate({ from: STRANGER, to: p.tx.to, data: p.tx.data, value: BigInt(p.tx.value) });
  ok(!sim.ok && decodeRevert(sim.revertData).name === "NotLauncher", "run from another wallet, it reverts NotLauncher", !sim.ok ? decodeRevert(sim.revertData).words : "it went through");
  const stranger = await sendAs(STRANGER, { to: p.tx.to as Address, data: p.tx.data, value: BigInt(p.tx.value), gas: BigInt(p.tx.gas) });
  ok(stranger.receipt.status === "reverted", "sent from another wallet, the launch reverts on chain", stranger.hash);
  ok((await pub.readContract({ address: POT, abi: POT_ABI, functionName: "token" })) === "0x0000000000000000000000000000000000000000", "and the burn pot still has no token");

  // The forge script, dry run on the same fork with the same launch.json and dev buy: the same bytes.
  const [owner, ownerBps, burnBps] = await Promise.all([
    pub.readContract({ address: SPLITTER, abi: SPLITTER_ABI, functionName: "owner" }),
    pub.readContract({ address: SPLITTER, abi: SPLITTER_ABI, functionName: "ownerBps" }),
    pub.readContract({ address: SPLITTER, abi: SPLITTER_ABI, functionName: "burnBps" }),
  ]);
  const contracts = join(process.cwd(), "contracts");
  const forge = spawnSync(join(process.env.HOME ?? "", ".foundry/bin/forge"), ["script", "script/LaunchToken.s.sol", "--rpc-url", RPC, "--sender", LAUNCHER], {
    cwd: contracts,
    encoding: "utf8",
    env: {
      ...process.env,
      WOVI_OPENING_BUY_WEI: BUY.toString(),
      WOVI_LAUNCH_JSON: readFileSync(LAUNCH_FILE(), "utf8"),
      WOVI_OWNER_WALLET: owner,
      WOVI_SPLIT_OWNER_BPS: String(ownerBps),
      WOVI_SPLIT_BURN_BPS: String(burnBps),
    },
  });
  if (forge.status !== 0) {
    console.log(forge.stdout.slice(-2000), forge.stderr.slice(-2000));
    ok(false, "the forge script's dry run");
  } else {
    const run = JSON.parse(readFileSync(join(contracts, "broadcast/LaunchToken.s.sol/4663/dry-run/run-latest.json"), "utf8"));
    const t = run.transactions[0].transaction;
    ok(run.transactions.length === 1 && same(t.to, POT) && same(t.from, LAUNCHER), "the forge script sends one call, launcher to burn pot");
    ok(t.input === p.tx.data, "the page's calldata is byte for byte the forge script's", `${(p.tx.data.length - 2) / 2} bytes`);
    ok(BigInt(t.value) === BigInt(p.tx.value), "the page's value is the forge script's", `${BigInt(t.value)} wei`);
  }
  writeFileSync(STATE, JSON.stringify({ predicted: p.predictedToken }));
}

async function launch() {
  console.log("== The launch: the page's server builds it, the launcher sends exactly that");
  const p = await prepareLaunch(launchDeps(), LAUNCHER);
  if (!p.ok) throw new Error(`the page refused: ${p.problem}`);
  const supplyCheck = await launchStatus(launchDeps());
  ok(supplyCheck.kind === "ready", "the page is still ready right before the send");
  const sent = await sendAs(LAUNCHER, { to: p.tx.to as Address, data: p.tx.data, value: BigInt(p.tx.value), gas: BigInt(p.tx.gas) });
  ok(sent.receipt.status === "success", "the launch transaction went through", `${sent.hash}, ${sent.receipt.gasUsed} gas of ${BigInt(p.tx.gas)}`);
  const out = await launchOutcome(launchDeps(), sent.hash);
  ok(out.state === "launched", "the page reads the launch back", out.state === "launched" ? `token ${out.launched.token}, ${out.launched.openingBuyTokens} tokens` : JSON.stringify(out));
  const state = JSON.parse(readFileSync(STATE, "utf8"));
  writeFileSync(STATE, JSON.stringify({ ...state, hash: sent.hash, tx: p.tx }));
}

async function after() {
  console.log("== After the launch");
  const state = JSON.parse(readFileSync(STATE, "utf8")) as { predicted: string; hash: Hex; tx: { to: Address; data: Hex; value: Hex; gas: Hex } };
  const token = await pub.readContract({ address: POT, abi: POT_ABI, functionName: "token" });
  ok(token !== "0x0000000000000000000000000000000000000000", "the burn pot's token() is set", token);
  ok(same(token, state.predicted), "it is the address the page predicted before the click");
  const [name, symbol] = await Promise.all([pub.readContract({ address: token, abi: TOKEN_ABI, functionName: "name" }), pub.readContract({ address: token, abi: TOKEN_ABI, functionName: "symbol" })]);
  const file = JSON.parse(readFileSync(LAUNCH_FILE(), "utf8"));
  ok(name === file.name && symbol === file.symbol, "the token's name and ticker", `${name} ($${symbol})`);
  const [boughtEth, boughtTokens, held] = await Promise.all([
    pub.readContract({ address: POT, abi: POT_ABI, functionName: "openingBuyEth" }),
    pub.readContract({ address: POT, abi: POT_ABI, functionName: "openingBuyTokens" }),
    pub.readContract({ address: token, abi: TOKEN_ABI, functionName: "balanceOf", args: [LAUNCHER] }),
  ]);
  ok(boughtTokens > BigInt(0) && held === boughtTokens, "the launcher holds exactly the dev buy's tokens", `${eth(boughtTokens)} $WOVI`);
  ok(boughtEth === BUY, "the burn pot's openingBuyEth is the configured dev buy", `${boughtEth} wei`);
  const info = await pub.readContract({ address: FACTORY, abi: FACTORY_ABI, functionName: "getLaunchedToken", args: [token] });
  ok(info.exists && info.creatorTaxBps === 300, "Pons records a 300 basis point creator tax");
  ok(same(info.creatorFeeRecipient, SPLITTER) && same(info.deployer, POT) && info.pairToken === "0x0000000000000000000000000000000000000000" && !info.buybackEnabled, "fees to the splitter, the pot as deployer, paired with ETH, buyback off");

  // A second launch: the page refuses, and the chain refuses it too.
  const again = await prepareLaunch(launchDeps(), LAUNCHER);
  ok(!again.ok && again.kind === "launched", "the page offers no second launch");
  const sim = await launchDeps().reader.simulate({ from: LAUNCHER, to: state.tx.to, data: state.tx.data, value: BigInt(state.tx.value) });
  ok(!sim.ok && decodeRevert(sim.revertData).name === "TokenAlreadySet", "the same call again reverts TokenAlreadySet");
  const second = await sendAs(LAUNCHER, { to: state.tx.to, data: state.tx.data, value: BigInt(state.tx.value), gas: BigInt(state.tx.gas) });
  ok(second.receipt.status === "reverted", "sent again for real, it reverts", second.hash);

  // Trades from another wallet, after the launch-seconds tax window.
  await test.increaseTime({ seconds: 3600 });
  await test.mine({ blocks: 1 });
  await test.setBalance({ address: TRADER, value: parseEther("5") });
  await test.setBalance({ address: KEEPER, value: parseEther("1") });
  const curve = info.curve;
  const buy = await sendAs(TRADER, { to: curve, data: encode(CURVE_ABI, "buy", [parseEther("0.5"), BigInt(0), TRADER]), value: parseEther("0.5") });
  ok(buy.receipt.status === "success", "a buy of 0.5 ETH from another wallet", buy.hash);
  const bal = await pub.readContract({ address: token, abi: TOKEN_ABI, functionName: "balanceOf", args: [TRADER] });
  await sendAs(TRADER, { to: token, data: encode(TOKEN_ABI, "approve", [curve, bal]) });
  const sell = await sendAs(TRADER, { to: curve, data: encode(CURVE_ABI, "sell", [bal / BigInt(2), BigInt(0), TRADER]) });
  ok(sell.receipt.status === "success", "a sell of half of it", sell.hash);
  let taxed = BigInt(0);
  for (const log of [...buy.receipt.logs, ...sell.receipt.logs]) {
    try {
      const e = decodeEventLog({ abi: CURVE_ABI, data: log.data, topics: log.topics });
      taxed += e.args.tax;
      if (e.eventName === "CurveSell") {
        const gross = e.args.quoteOut + e.args.fee + e.args.tax;
        ok(e.args.tax === (gross * BigInt(300)) / BigInt(10_000), "the sell paid exactly 3% creator tax", `${e.args.tax} of ${gross} wei`);
      }
    } catch {
      /* another contract's event */
    }
  }

  // The keeper's sweep: the splitter splits by its shares, to the wei.
  const [owner, ownerBps] = await Promise.all([pub.readContract({ address: SPLITTER, abi: SPLITTER_ABI, functionName: "owner" }), pub.readContract({ address: SPLITTER, abi: SPLITTER_ABI, functionName: "ownerBps" })]);
  const [ownerBefore, potBefore] = await Promise.all([pub.getBalance({ address: owner }), pub.getBalance({ address: POT })]);
  const sweep = await sendAs(KEEPER, { to: SPLITTER, data: encode(SPLITTER_ABI, "sweep", []) });
  ok(sweep.receipt.status === "success", "the keeper's sweep", sweep.hash);
  const split = sweep.receipt.logs.map((l) => tryDecode(SPLITTER_ABI, l)).find((e) => e?.eventName === "Split") as { args: { amount: bigint; toOwner: bigint; toBurn: bigint; ownerPushed: boolean; burnPushed: boolean } } | undefined;
  if (!split) ok(false, "a Split event");
  else {
    const { amount, toOwner, toBurn } = split.args;
    const [ownerAfter, potAfter] = await Promise.all([pub.getBalance({ address: owner }), pub.getBalance({ address: POT })]);
    console.log(`  fees split: ${amount} wei (the trades' creator tax was ${taxed} wei)`);
    ok(amount > BigInt(0), "fees reached the splitter");
    ok(toOwner === (amount * BigInt(ownerBps)) / BigInt(10_000) && toOwner + toBurn === amount, "split by the splitter's shares, to the wei", `${toOwner} + ${toBurn} = ${amount}`);
    ok(ownerAfter - ownerBefore === toOwner, "the owner wallet received exactly its share", `${ownerAfter - ownerBefore} wei`);
    ok(potAfter - potBefore === toBurn, "the burn pot received exactly its share", `${potAfter - potBefore} wei`);
  }

  // The keeper's burn: the supply falls by exactly what was burned.
  await test.increaseTime({ seconds: 31 * 60 });
  await test.mine({ blocks: 1 });
  const preview = await pub.readContract({ address: POT, abi: POT_ABI, functionName: "preview" });
  ok(preview[2], "the burn pot's preview() says ready", `${preview[0]} wei to spend`);
  const supplyBefore = await pub.readContract({ address: token, abi: TOKEN_ABI, functionName: "totalSupply" });
  const burn = await sendAs(KEEPER, { to: POT, data: encode(POT_ABI, "burn", [BigInt(0)]) });
  ok(burn.receipt.status === "success", "the keeper's burn(0)", burn.hash);
  const burned = burn.receipt.logs.map((l) => tryDecode(POT_ABI, l)).find((e) => e?.eventName === "Burned") as { args: { ethIn: bigint; tokensBurned: bigint } } | undefined;
  const supplyAfter = await pub.readContract({ address: token, abi: TOKEN_ABI, functionName: "totalSupply" });
  ok(Boolean(burned && burned.args.tokensBurned > BigInt(0)), "it bought and burned $WOVI", burned ? `${eth(burned.args.tokensBurned)} $WOVI for ${burned.args.ethIn} wei` : "no Burned event");
  ok(Boolean(burned) && supplyBefore - supplyAfter === burned!.args.tokensBurned, "totalSupply fell by exactly that", `${eth(supplyBefore)} to ${eth(supplyAfter)}`);
}

function encode(abi: readonly unknown[], functionName: string, args: readonly unknown[]): Hex {
  return (encodeFunctionData as (a: unknown) => Hex)({ abi, functionName, args });
}
function tryDecode(abi: readonly unknown[], log: { data: Hex; topics: [Hex, ...Hex[]] | [] }) {
  try {
    return decodeEventLog({ abi: abi as never, data: log.data, topics: log.topics }) as unknown as { eventName: string; args: Record<string, unknown> };
  } catch {
    return null;
  }
}

async function main() {
  const step = process.argv[2];
  if (step === "before") await before();
  else if (step === "launch") await launch();
  else if (step === "after") await after();
  else throw new Error("say which step: before, launch or after");
  if (failures) {
    console.log(`\n${failures} check${failures === 1 ? "" : "s"} FAILED`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
