// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@aave/core-v3/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol";
import "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

contract IntraChainArbitrage is FlashLoanSimpleReceiverBase, Ownable, ReentrancyGuard {
    using Math for uint256;

    // Comisión de Aave V3: 0.05%
    uint256 private constant AAVE_FEE = 5; // Base 10000
    
    // DEX routers
    IUniswapV2Router02 public immutable dexA;
    IUniswapV2Router02 public immutable dexB;
    
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
        address _dexB
    ) FlashLoanSimpleReceiverBase(IPoolAddressesProvider(_addressProvider)) Ownable(msg.sender) {
        dexA = IUniswapV2Router02(_dexA);
        dexB = IUniswapV2Router02(_dexB);
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
        
        // Path para el swap
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;
        
        // Ejecutar swap
        uint256[] memory amounts = dexA.swapExactTokensForTokens(
            amount,
            minAmountOut,
            path,
            address(this),
            block.timestamp
        );
        
        return amounts[amounts.length - 1];
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
        
        // Path para el swap
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;
        
        // Ejecutar swap
        uint256[] memory amounts = dexB.swapExactTokensForTokens(
            amount,
            minAmountOut,
            path,
            address(this),
            block.timestamp
        );
        
        return amounts[amounts.length - 1];
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
        // Decodificar parámetros
        (
            address tokenOut,
            bool dexAToB,
            uint256 minAmountOut
        ) = abi.decode(params, (address, bool, uint256));

        // Ejecutar arbitraje
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
     * @notice Calcula el beneficio potencial
     */
    function calculateArbitrage(
        address tokenIn,
        address tokenOut,
        uint256 amount
    ) external view returns (uint256 profit, bool dexAToB) {
        // Path para el swap
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;

        // Obtener precios en ambos DEX
        uint256[] memory amountsDexA = dexA.getAmountsOut(amount, path);
        uint256[] memory amountsDexB = dexB.getAmountsOut(amount, path);

        // Calcular mejor ruta
        uint256 profitAToB;
        uint256 profitBToA;

        // Ruta A -> B
        if (amountsDexA[1] > amountsDexB[1]) {
            path[0] = tokenOut;
            path[1] = tokenIn;
            uint256[] memory amountsBack = dexB.getAmountsOut(amountsDexA[1], path);
            if (amountsBack[1] > amount) {
                profitAToB = amountsBack[1] - amount;
            }
        }

        // Ruta B -> A
        if (amountsDexB[1] > amountsDexA[1]) {
            path[0] = tokenOut;
            path[1] = tokenIn;
            uint256[] memory amountsBack = dexA.getAmountsOut(amountsDexB[1], path);
            if (amountsBack[1] > amount) {
                profitBToA = amountsBack[1] - amount;
            }
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