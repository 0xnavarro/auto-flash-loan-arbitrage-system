// SPDX-License-Identifier: MIT
/*
███    ██  █████  ██    ██  █████  ██████  ██████   ██████  
████   ██ ██   ██ ██    ██ ██   ██ ██   ██ ██   ██ ██    ██ 
██ ██  ██ ███████ ██    ██ ███████ ██████  ██████  ██    ██ 
██  ██ ██ ██   ██  ██  ██  ██   ██ ██   ██ ██   ██ ██    ██ 
██   ████ ██   ██   ████   ██   ██ ██   ██ ██   ██  ██████  
                                                    
        ╭──────────────╮
        │     ___      │
        │    [^_^]     │
        │   /|__|\\    │
        │    d  b      │
        ╰──────────────╯

Flash Loan Arbitrage Contract v1.0
Developed by C. Navarro
*/

pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@aave/core-v3/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol";
import "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import "@aave/core-v3/contracts/interfaces/IPool.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";

contract FlashLoanArbitrage is FlashLoanSimpleReceiverBase, Ownable {
    using Math for uint256;
    
    // Pools de Uniswap V3 que vamos a utilizar
    IUniswapV3Pool public poolA;
    IUniswapV3Pool public poolB;
    
    // Router de Uniswap V3
    ISwapRouter public immutable swapRouter;
    
    // Evento para registrar arbitrajes exitosos
    event ArbitrageExecuted(
        address indexed token0,
        address indexed token1,
        uint256 profit
    );
    
    // Eventos para debugging
    event SwapStarted(address tokenIn, address tokenOut, uint256 amount);
    event SwapCompleted(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut);
    event FlashLoanReceived(address token, uint256 amount, uint256 premium);
    event ArbitrageStarted(address tokenIn, address tokenOut, bool isPoolAFirst);
    event AmountsCalculated(
        uint256 flashLoanAmount,
        uint256 flashLoanFee,
        uint256 firstSwapAmount,
        uint256 secondSwapAmount,
        uint256 minRequiredAmount,
        uint256 actualReceivedAmount
    );
    
    constructor(
        address _addressProvider,
        address _swapRouter
    ) FlashLoanSimpleReceiverBase(IPoolAddressesProvider(_addressProvider)) Ownable(msg.sender) {
        swapRouter = ISwapRouter(_swapRouter);
    }

    /**
     * @notice Configura las pools para el arbitraje
     */
    function configurePools(
        address _poolA,
        address _poolB
    ) external onlyOwner {
        poolA = IUniswapV3Pool(_poolA);
        poolB = IUniswapV3Pool(_poolB);
    }

    /**
     * @notice Ejecuta el arbitraje entre pools
     */
    function _executeArbitrage(
        address tokenIn,
        address tokenOut,
        uint256 amount,
        bool isPoolAFirst
    ) internal returns (uint256) {
        emit SwapStarted(tokenIn, tokenOut, amount);
        
        // Aprobar tokens para el router
        TransferHelper.safeApprove(tokenIn, address(swapRouter), amount);
        
        // Calcular slippage máximo (0.5%)
        uint256 minAmountOut = amount * 995 / 1000;
        
        // Parámetros para el primer swap
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: isPoolAFirst ? poolA.fee() : poolB.fee(),
            recipient: address(this),
            deadline: block.timestamp + 300, // 5 minutos
            amountIn: amount,
            amountOutMinimum: minAmountOut,
            sqrtPriceLimitX96: 0
        });
        
        // Primer swap (compra)
        uint256 amountOut = swapRouter.exactInputSingle(params);
        emit SwapCompleted(tokenIn, tokenOut, amount, amountOut);
        
        // Calcular slippage para el segundo swap
        uint256 minAmountOutFinal = amount + ((amount * 5) / 10000); // amount + 0.05% (fee de Aave)
        
        // Aprobar para el segundo swap
        TransferHelper.safeApprove(tokenOut, address(swapRouter), amountOut);
        
        emit SwapStarted(tokenOut, tokenIn, amountOut);
        
        // Parámetros para el swap de vuelta (venta)
        params.tokenIn = tokenOut;
        params.tokenOut = tokenIn;
        params.fee = isPoolAFirst ? poolB.fee() : poolA.fee();
        params.amountIn = amountOut;
        params.amountOutMinimum = minAmountOutFinal;
        
        // Segundo swap
        uint256 finalAmount = swapRouter.exactInputSingle(params);
        emit SwapCompleted(tokenOut, tokenIn, amountOut, finalAmount);
        
        // Emitir evento con todos los montos para debugging
        emit AmountsCalculated(
            amount,                    // Monto del flash loan
            (amount * 5) / 10000,      // Fee del flash loan (0.05%)
            amountOut,                 // Monto recibido del primer swap
            finalAmount,               // Monto recibido del segundo swap
            minAmountOutFinal,         // Monto mínimo necesario
            finalAmount                // Monto actual recibido
        );
        
        // Verificar que obtuvimos suficiente para repagar el préstamo
        require(finalAmount >= minAmountOutFinal, "Too little received");
        
        return finalAmount;
    }

    /**
     * @notice Callback de Aave para el flash loan
     */
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        emit FlashLoanReceived(asset, amount, premium);
        
        // Decodificar parámetros
        (address tokenOut, bool isPoolAFirst) = abi.decode(params, (address, bool));
        emit ArbitrageStarted(asset, tokenOut, isPoolAFirst);
        
        // Ejecutar arbitraje
        uint256 amountReceived = _executeArbitrage(asset, tokenOut, amount, isPoolAFirst);
        
        // Verificar beneficio
        uint256 amountToRepay = amount + premium;
        require(amountReceived >= amountToRepay, "Insufficient funds to repay flash loan");
        
        // Emitir evento de beneficio
        emit ArbitrageExecuted(asset, tokenOut, amountReceived - amountToRepay);
        
        // Aprobar repago
        IERC20(asset).approve(address(POOL), amountToRepay);
        
        return true;
    }

    /**
     * @notice Inicia el flash loan para arbitraje
     */
    function requestFlashLoan(
        address asset,
        uint256 amount,
        address tokenOut,
        bool isPoolAFirst
    ) external onlyOwner {
        require(address(poolA) != address(0) && address(poolB) != address(0), "Pools not configured");
        
        bytes memory params = abi.encode(tokenOut, isPoolAFirst);
        POOL.flashLoanSimple(
            address(this),
            asset,
            amount,
            params,
            0
        );
    }

    /**
     * @notice Retira tokens del contrato
     */
    function withdrawToken(
        address token
    ) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "No balance to withdraw");
        IERC20(token).transfer(owner(), balance);
    }

    /**
     * @notice Retira ETH del contrato
     */
    function withdrawETH() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH balance to withdraw");
        payable(owner()).transfer(balance);
    }

    receive() external payable {}
} 