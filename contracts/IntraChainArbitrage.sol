// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@aave/core-v3/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol";
import "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "./interfaces/IQuoterV2.sol";

contract IntraChainArbitrage is FlashLoanSimpleReceiverBase, Ownable, ReentrancyGuard {
    using Math for uint256;

    // Comisión de Aave V3: 0.05%
    uint256 private constant AAVE_FEE = 5; // Base 10000
    
    // DEX routers
    ISwapRouter public immutable dexA;
    ISwapRouter public immutable dexB;
    
    // Quoter
    IQuoterV2 public immutable quoter;
    
    // Eventos
    event ArbitrageExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amount,
        uint256 profit,
        uint256 timestamp
    );
    
    event ArbitrageFailed(
        string reason,
        uint256 timestamp
    );

    constructor(
        address _addressProvider,
        address _dexA,
        address _dexB,
        address _quoter
    ) FlashLoanSimpleReceiverBase(IPoolAddressesProvider(_addressProvider)) Ownable(msg.sender) {
        dexA = ISwapRouter(_dexA);
        dexB = ISwapRouter(_dexB);
        quoter = IQuoterV2(_quoter);
    }

    /**
     * @notice Ejecuta swap en DEX A
     */
    function _swapExactTokensInDexA(
        address tokenIn,
        address tokenOut,
        uint256 amount,
        uint256 minAmountOut
    ) internal returns (uint256) {
        // Aprobar tokens para el DEX
        IERC20(tokenIn).approve(address(dexA), amount);
        
        // Ejecutar swap
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: 3000, // 0.3%
            recipient: address(this),
            deadline: block.timestamp,
            amountIn: amount,
            amountOutMinimum: minAmountOut,
            sqrtPriceLimitX96: 0
        });
        
        return dexA.exactInputSingle(params);
    }

    /**
     * @notice Ejecuta swap en DEX B
     */
    function _swapExactTokensInDexB(
        address tokenIn,
        address tokenOut,
        uint256 amount,
        uint256 minAmountOut
    ) internal returns (uint256) {
        // Aprobar tokens para el DEX
        IERC20(tokenIn).approve(address(dexB), amount);
        
        // Ejecutar swap
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: 3000, // 0.3%
            recipient: address(this),
            deadline: block.timestamp,
            amountIn: amount,
            amountOutMinimum: minAmountOut,
            sqrtPriceLimitX96: 0
        });
        
        return dexB.exactInputSingle(params);
    }

    /**
     * @notice Callback de Aave para ejecutar la lógica del flash loan
     */
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address,
        bytes calldata params
    ) external override returns (bool) {
        // Decodificar parámetros
        (
            address tokenOut,
            bool dexAToB,
            uint256 minAmountOut
        ) = abi.decode(params, (address, bool, uint256));
        
        uint256 amountReceived;
        uint256 finalAmount;
        
        if (dexAToB) {
            // Comprar en DEX A, vender en DEX B
            amountReceived = _swapExactTokensInDexA(
                asset,
                tokenOut,
                amount,
                minAmountOut
            );
            
            finalAmount = _swapExactTokensInDexB(
                tokenOut,
                asset,
                amountReceived,
                amount + premium
            );
        } else {
            // Comprar en DEX B, vender en DEX A
            amountReceived = _swapExactTokensInDexB(
                asset,
                tokenOut,
                amount,
                minAmountOut
            );
            
            finalAmount = _swapExactTokensInDexA(
                tokenOut,
                asset,
                amountReceived,
                amount + premium
            );
        }
        
        // Verificar beneficio
        require(
            finalAmount >= amount + premium,
            "Insufficient profit"
        );
        
        // Aprobar repago del flash loan
        IERC20(asset).approve(address(POOL), amount + premium);
        
        // Emitir evento
        emit ArbitrageExecuted(
            asset,
            tokenOut,
            amount,
            finalAmount - (amount + premium),
            block.timestamp
        );
        
        return true;
    }

    /**
     * @notice Inicia el arbitraje
     */
    function executeArbitrage(
        address asset,
        uint256 amount,
        address tokenOut,
        bool dexAToB,
        uint256 minAmountOut
    ) external onlyOwner nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        
        bytes memory params = abi.encode(
            tokenOut,
            dexAToB,
            minAmountOut
        );
        
        try POOL.flashLoanSimple(
            address(this),
            asset,
            amount,
            params,
            0
        ) {
            // Flash loan exitoso
        } catch Error(string memory reason) {
            emit ArbitrageFailed(
                reason,
                block.timestamp
            );
        } catch (bytes memory reason) {
            emit ArbitrageFailed(
                string(reason),
                block.timestamp
            );
        }
    }

    /**
     * @notice Calcula el beneficio potencial del arbitraje
     */
    function calculateArbitrage(
        address tokenIn,
        address tokenOut,
        uint256 amount
    ) external returns (uint256 profit, bool dexAToB) {
        uint256 profitAToB = 0;
        uint256 profitBToA = 0;
        
        // Ruta A -> B
        uint256 amountOutA = _getAmountOut(dexA, tokenIn, tokenOut, amount);
        uint256 amountOutB = _getAmountOut(dexB, tokenOut, tokenIn, amountOutA);
        if (amountOutB > amount) {
            profitAToB = amountOutB - amount;
        }
        
        // Ruta B -> A
        uint256 amountOutB2 = _getAmountOut(dexB, tokenIn, tokenOut, amount);
        uint256 amountOutA2 = _getAmountOut(dexA, tokenOut, tokenIn, amountOutB2);
        if (amountOutA2 > amount) {
            profitBToA = amountOutA2 - amount;
        }
        
        // Calcular costos
        uint256 aaveFee = (amount * AAVE_FEE) / 10000;
        uint256 estimatedGas = 0.005 ether; // ~500k gas
        
        // Determinar mejor ruta
        if (profitAToB > profitBToA && profitAToB > (aaveFee + estimatedGas)) {
            return (profitAToB - (aaveFee + estimatedGas), true);
        } else if (profitBToA > (aaveFee + estimatedGas)) {
            return (profitBToA - (aaveFee + estimatedGas), false);
        }
        
        return (0, false);
    }

    /**
     * @notice Obtiene el amount out estimado para un swap
     */
    function _getAmountOut(
        ISwapRouter router,
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) internal returns (uint256) {
        try quoter.quoteExactInputSingle(
            tokenIn,
            tokenOut,
            3000, // 0.3% fee tier
            amountIn,
            0
        ) returns (
            uint256 amountOut,
            uint160 sqrtPriceX96After,
            uint32 initializedTicksCrossed,
            uint256 gasEstimate
        ) {
            return amountOut;
        } catch {
            return 0;
        }
    }

    /**
     * @notice Retira tokens del contrato
     */
    function withdrawToken(
        address token,
        uint256 amount
    ) external onlyOwner {
        IERC20(token).transfer(msg.sender, amount);
    }

    /**
     * @notice Retira ETH del contrato
     */
    function withdrawETH() external onlyOwner {
        payable(msg.sender).transfer(address(this).balance);
    }

    /**
     * @notice Recibe ETH
     */
    receive() external payable {}
} 