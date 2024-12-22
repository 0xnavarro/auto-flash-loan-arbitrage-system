// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@aave/core-v3/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol";
import "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import "@aave/core-v3/contracts/interfaces/IPool.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";

contract FlashLoanArbitrage is FlashLoanSimpleReceiverBase, Ownable {
    using Math for uint256;
    
    // Direcciones de los DEX que vamos a utilizar
    address public dexA;
    address public dexB;
    
    // Interfaces de los routers
    IUniswapV2Router02 public immutable dexARouter;
    IUniswapV2Router02 public immutable dexBRouter;
    
    // Evento para registrar arbitrajes exitosos
    event ArbitrageExecuted(
        address indexed token0,
        address indexed token1,
        uint256 profit
    );
    
    constructor(
        address _addressProvider,
        address _dexA,
        address _dexB
    ) FlashLoanSimpleReceiverBase(IPoolAddressesProvider(_addressProvider)) Ownable(msg.sender) {
        dexA = _dexA;
        dexB = _dexB;
        dexARouter = IUniswapV2Router02(_dexA);
        dexBRouter = IUniswapV2Router02(_dexB);
    }

    /**
     * @notice Ejecuta el arbitraje entre DEXs
     * @param tokenIn Dirección del token de entrada
     * @param tokenOut Dirección del token de salida
     * @param amount Cantidad a intercambiar
     */
    function _executeArbitrage(
        address tokenIn,
        address tokenOut,
        uint256 amount
    ) internal returns (uint256) {
        // Aprobar tokens para el primer DEX
        IERC20(tokenIn).approve(address(dexARouter), amount);
        
        // Path para el swap
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;
        
        // Ejecutar swap en DEX A
        uint256[] memory amountsFromA = dexARouter.swapExactTokensForTokens(
            amount,
            0, // Acepta cualquier cantidad (se ajustará después)
            path,
            address(this),
            block.timestamp
        );
        
        // Aprobar tokens para el segundo DEX
        IERC20(tokenOut).approve(address(dexBRouter), amountsFromA[1]);
        
        // Invertir el path para el swap de vuelta
        address[] memory pathBack = new address[](2);
        pathBack[0] = tokenOut;
        pathBack[1] = tokenIn;
        
        // Ejecutar swap en DEX B
        uint256[] memory amountsFromB = dexBRouter.swapExactTokensForTokens(
            amountsFromA[1],
            0, // Acepta cualquier cantidad
            pathBack,
            address(this),
            block.timestamp
        );
        
        return amountsFromB[1];
    }

    /**
     * @notice Ejecuta la operación del flash loan
     */
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        // Decodificar los parámetros
        (address tokenOut) = abi.decode(params, (address));
        
        // Ejecutar el arbitraje
        uint256 amountReceived = _executeArbitrage(asset, tokenOut, amount);
        
        // Calcular el beneficio
        uint256 amountToRepay = amount + premium;
        require(
            amountReceived >= amountToRepay,
            "Insufficient funds to repay flash loan"
        );
        
        // Calcular y emitir evento de beneficio
        uint256 profit = amountReceived - amountToRepay;
        emit ArbitrageExecuted(asset, tokenOut, profit);
        
        // Aprobar el repago
        IERC20(asset).approve(address(POOL), amountToRepay);
        
        return true;
    }

    /**
     * @notice Inicia el flash loan para arbitraje
     * @param asset Token que queremos pedir prestado
     * @param amount Cantidad a pedir prestada
     * @param tokenOut Token contra el que queremos hacer arbitraje
     */
    function requestFlashLoan(
        address asset,
        uint256 amount,
        address tokenOut
    ) external onlyOwner {
        bytes memory params = abi.encode(tokenOut);
        POOL.flashLoanSimple(
            address(this),
            asset,
            amount,
            params,
            0 // referral code
        );
    }

    /**
     * @notice Función para retirar tokens
     */
    function withdrawToken(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "No balance to withdraw");
        IERC20(token).transfer(owner(), balance);
    }

    /**
     * @notice Función para retirar ETH
     */
    function withdrawETH() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH balance to withdraw");
        payable(owner()).transfer(balance);
    }

    // Función para recibir ETH
    receive() external payable {}

    // Verificar la salud del token
    function checkTokenSafety(address tokenAddress) external view returns (bool) {
        // Verificar que el token implementa la interfaz ERC20
        try IERC20(tokenAddress).totalSupply() returns (uint256) {
            return true;
        } catch {
            return false;
        }
    }

    // Calcular el tamaño óptimo del trade
    function calculateOptimalTradeSize(uint256 liquidityUSD) external pure returns (uint256) {
        return Math.min(liquidityUSD / 10, 10000); // Máximo 10k USD, 10% de la liquidez
    }

    struct ArbitrageParams {
        uint256 amountIn;
        uint256 expectedProfit;
        uint256 gasPrice;
        uint256 gasLimit;
    }

    // Calcular si el arbitraje es rentable
    function calculateArbitrageProfitability(
        address tokenIn,
        address tokenOut,
        uint256 amount
    ) external view returns (ArbitrageParams memory) {
        // Obtener precios de ambos DEX
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;

        // Precio en DEX A
        uint256[] memory amountsA = dexARouter.getAmountsOut(amount, path);
        
        // Precio en DEX B
        uint256[] memory amountsB = dexBRouter.getAmountsOut(amount, path);

        // Calcular diferencia de precios
        uint256 priceA = (amountsA[1] * 1e18) / amount;
        uint256 priceB = (amountsB[1] * 1e18) / amount;
        
        // Calcular beneficio potencial
        uint256 profit;
        uint256 optimalAmount;
        
        if (priceA > priceB) {
            // Comprar en B, vender en A
            profit = ((priceA - priceB) * amount) / 1e18;
            optimalAmount = calculateOptimalAmount(amount, priceB, priceA);
        } else {
            // Comprar en A, vender en B
            profit = ((priceB - priceA) * amount) / 1e18;
            optimalAmount = calculateOptimalAmount(amount, priceA, priceB);
        }

        // Estimar costos de gas
        uint256 gasPrice = tx.gasprice;
        uint256 gasLimit = 300000; // Estimado para la transacción completa
        uint256 gasCost = gasPrice * gasLimit;

        // Calcular beneficio neto
        uint256 flashLoanFee = (amount * 9) / 10000; // 0.09% fee de Aave
        uint256 netProfit = profit > (gasCost + flashLoanFee) ? 
            profit - (gasCost + flashLoanFee) : 0;

        return ArbitrageParams({
            amountIn: optimalAmount,
            expectedProfit: netProfit,
            gasPrice: gasPrice,
            gasLimit: gasLimit
        });
    }

    // Calcular el tamaño óptimo del préstamo
    function calculateOptimalAmount(
        uint256 baseAmount,
        uint256 buyPrice,
        uint256 sellPrice
    ) internal pure returns (uint256) {
        // Fórmula para maximizar el beneficio considerando el impacto en el precio
        // Usamos una aproximación conservadora para evitar slippage excesivo
        uint256 priceSpread = sellPrice - buyPrice;
        uint256 optimalAmount;

        if (priceSpread > 0) {
            // Calculamos el tamaño óptimo basado en la profundidad del mercado
            // y el spread de precios
            optimalAmount = (baseAmount * priceSpread) / buyPrice;
            
            // Limitamos el tamaño para evitar demasiado slippage
            if (optimalAmount > baseAmount * 3) {
                optimalAmount = baseAmount * 3;
            }
        }

        return optimalAmount;
    }
} 