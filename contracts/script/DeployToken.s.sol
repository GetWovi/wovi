// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IPonsV2LaunchFactory} from "../src/interfaces/IPons.sol";
import {WoviToken} from "./WoviToken.sol";

/// Deploys the burn pot and the splitter of $WOVI, in the order the launch runbook needs: every address the token's
/// fees will ever go to exists, and is checked, before there is a token.
///
///   1. WoviBurnPot   given the splitter's address ahead of time (worked out from the deployer's nonce)
///   2. WoviSplitter  last: it refuses to exist unless the burn pot is there and wired to it
///
/// Nothing is set afterwards, because nothing can be. The token does not exist yet: script/LaunchToken.s.sol makes it,
/// from the same wallet (the launcher is the deployer).
///
/// contracts/token-deploy.sh runs this with every value filled in, the key at forge's own prompt. Without --broadcast
/// it is a dry run.
contract DeployToken is Script, WoviToken {
    function run() external returns (Token memory t) {
        require(block.chainid == ROBINHOOD_CHAIN, "not Robinhood Chain");
        IPonsV2LaunchFactory factory = _factory();

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        Wiring memory w = _wiringFromEnv(deployer);
        // a wallet with code on it could refuse its share; the share would wait in the splitter
        require(w.owner.code.length == 0, "WOVI_OWNER_WALLET has code on it: use a plain wallet");
        t = _deployToken(deployer, w, factory);
        vm.stopBroadcast();

        _verifyToken(t, w, factory);
        require(address(t.burnPot.token()) == address(0), "a fresh burn pot has no token");

        console.log("Deployed from %s, which is also the launcher.", deployer);
        console.log("");
        console.log("WOVI_BURN_POT_ADDRESS=%s", address(t.burnPot));
        console.log("WOVI_SPLITTER_ADDRESS=%s", address(t.splitter));
    }

    /// Reads a deployment back from the chain and checks every wire. No broadcast, no key.
    function check(address launcher) external view {
        _requireChain();
        Token memory t = _deployed();
        _verifyToken(t, _wiringFromEnv(launcher), _factory());
        console.log("OK: the burn pot and the splitter are wired to each other, to the wallets and to Pons.");
        console.log("    burn pot   %s", address(t.burnPot));
        console.log("    splitter   %s (the address the token's fees will be paid to)", address(t.splitter));
        console.log("    owner      %s", t.splitter.owner());
        console.log("    launcher   %s", t.burnPot.launcher());
        console.log("    token      %s", address(t.burnPot.token()));
    }
}
