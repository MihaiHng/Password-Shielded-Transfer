// SPDX-License-Identifier: MIT

pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {PST} from "../src/PST.sol";

contract DeployPST is Script {
    uint256 transferFeeLvlOne = 1000;
    uint256 transferFeeLvlTwo = 100;
    uint256 transferFeeLvlThree = 10;

    function run() external returns (PST) {
        vm.startBroadcast();
        PST pST = new PST(transferFeeLvlOne, transferFeeLvlTwo, transferFeeLvlThree);
        vm.stopBroadcast();
        return pST;
    }
}
