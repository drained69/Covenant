// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Covenant Team
pragma solidity 0.8.34;

import {Script, console} from "../lib/forge-std/src/Script.sol";

contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public immutable decimals;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address receiver, uint256 amount) public returns (bool) {
        require(amount <= balanceOf[msg.sender], "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[receiver] += amount;
        emit Transfer(msg.sender, receiver, amount);
        return true;
    }

    function transferFrom(address sender, address receiver, uint256 amount) public returns (bool) {
        require(amount <= balanceOf[sender], "Insufficient balance");
        if (allowance[sender][msg.sender] != type(uint256).max) {
            require(amount <= allowance[sender][msg.sender], "Insufficient allowance");
            allowance[sender][msg.sender] -= amount;
        }
        balanceOf[sender] -= amount;
        balanceOf[receiver] += amount;
        emit Transfer(sender, receiver, amount);
        return true;
    }

    function approve(address spender, uint256 amount) public returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }
}

/// @notice Deploys mock loan and collateral tokens for testnet demonstration.
contract DeployTestTokens is Script {
    function run() external returns (address usdc, address wbtc) {
        uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);

        MockERC20 usdcToken = new MockERC20("Test USDC", "USDC", 6);
        MockERC20 wbtcToken = new MockERC20("Test Wrapped BTC", "WBTC", 8);

        // Mint test tokens to deployer
        usdcToken.mint(deployer, 500_000 * 10**6);
        wbtcToken.mint(deployer, 10 * 10**8);

        console.log("MockUSDC deployed at :", address(usdcToken));
        console.log("MockWBTC deployed at :", address(wbtcToken));
        console.log("Deployer minted USDC  :", usdcToken.balanceOf(deployer));
        console.log("Deployer minted WBTC  :", wbtcToken.balanceOf(deployer));

        vm.stopBroadcast();

        return (address(usdcToken), address(wbtcToken));
    }
}
