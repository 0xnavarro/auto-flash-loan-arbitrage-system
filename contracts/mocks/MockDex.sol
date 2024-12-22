// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockDex is Ownable {
    // Mapping de pares de tokens a sus precios
    mapping(address => mapping(address => uint256)) public prices;
    uint256 private constant FEE = 30; // 0.3%

    constructor() Ownable(msg.sender) {}

    function setPrice(
        address tokenIn,
        address tokenOut,
        uint256 price
    ) external onlyOwner {
        prices[tokenIn][tokenOut] = price;
    }

    function getAmountsOut(
        uint256 amountIn,
        address[] calldata path
    ) external view returns (uint256[] memory amounts) {
        require(path.length == 2, "Invalid path length");
        
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        
        // Calcular cantidad de salida basada en el precio
        uint256 price = prices[path[0]][path[1]];
        require(price > 0, "Price not set");
        
        // Aplicar fee
        uint256 amountWithFee = (amountIn * (10000 - FEE)) / 10000;
        amounts[1] = (amountWithFee * price) / 1e18;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        require(deadline >= block.timestamp, "Expired");
        require(path.length == 2, "Invalid path length");
        
        // Obtener cantidades
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        
        // Calcular cantidad de salida
        uint256 price = prices[path[0]][path[1]];
        require(price > 0, "Price not set");
        
        // Aplicar fee
        uint256 amountWithFee = (amountIn * (10000 - FEE)) / 10000;
        amounts[1] = (amountWithFee * price) / 1e18;
        
        require(amounts[1] >= amountOutMin, "Insufficient output amount");
        
        // Transferir tokens
        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        IERC20(path[1]).transfer(to, amounts[1]);
        
        return amounts;
    }

    function getReserves(
        address tokenA,
        address tokenB
    ) external view returns (uint112 reserveA, uint112 reserveB, uint32 blockTimestampLast) {
        // Simular reservas basadas en los precios
        uint256 price = prices[tokenA][tokenB];
        require(price > 0, "Price not set");
        
        reserveA = 1000000 * 1e18; // 1M tokens
        reserveB = uint112((uint256(reserveA) * price) / 1e18);
        blockTimestampLast = uint32(block.timestamp);
    }
} 