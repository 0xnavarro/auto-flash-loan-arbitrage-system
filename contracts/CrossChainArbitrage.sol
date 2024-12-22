// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@aave/core-v3/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol";
import "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

interface IStargateRouter {
    function swap(
        uint16 _dstChainId,
        uint256 _srcPoolId,
        uint256 _dstPoolId,
        address payable _refundAddress,
        uint256 _amountLD,
        uint256 _minAmountLD,
        bytes calldata _to,
        bytes calldata _payload
    ) external payable;
}

contract CrossChainArbitrage is FlashLoanSimpleReceiverBase, Ownable, ReentrancyGuard {
    // Comisión de Aave V3: 0.05%
    uint256 private constant AAVE_FEE = 5; // Base 10000
    
    // DEX en la cadena origen
    IUniswapV2Router02 public immutable sourceDex;
    
    // Router de Stargate para cross-chain
    IStargateRouter public immutable stargateRouter;
    
    // Mapping de chains soportadas
    mapping(uint16 => bool) public supportedChains;
    
    // Eventos
    event CrossChainArbitrageStarted(
        address indexed tokenIn,
        uint256 amount,
        uint16 targetChain,
        uint256 timestamp
    );
    
    event CrossChainArbitrageFailed(
        string reason,
        uint256 timestamp
    );

    constructor(
        address _addressProvider,
        address _sourceDex,
        address _stargateRouter
    ) FlashLoanSimpleReceiverBase(IPoolAddressesProvider(_addressProvider)) Ownable(msg.sender) {
        sourceDex = IUniswapV2Router02(_sourceDex);
        stargateRouter = IStargateRouter(_stargateRouter);
        
        // Configurar chains soportadas
        supportedChains[110] = true; // BSC
        supportedChains[42161] = true; // Arbitrum
        supportedChains[8453] = true; // Base
    }

    /**
     * @notice Ejecuta el primer paso del arbitraje cross-chain
     */
    function _executeSourceSwap(
        address tokenIn,
        address tokenOut,
        uint256 amount
    ) internal returns (uint256) {
        // Aprobar tokens para el DEX
        IERC20(tokenIn).approve(address(sourceDex), amount);
        
        // Path para el swap
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;
        
        // Ejecutar swap
        uint256[] memory amounts = sourceDex.swapExactTokensForTokens(
            amount,
            0,
            path,
            address(this),
            block.timestamp
        );
        
        return amounts[amounts.length - 1];
    }

    /**
     * @notice Inicia el bridge cross-chain
     */
    function _bridgeToTargetChain(
        uint16 targetChain,
        uint256 srcPoolId,
        uint256 dstPoolId,
        uint256 amount
    ) internal {
        require(supportedChains[targetChain], "Unsupported chain");
        
        // Preparar datos para el bridge
        bytes memory payload = abi.encode(msg.sender);
        
        // Aprobar tokens para Stargate
        IERC20(address(this)).approve(address(stargateRouter), amount);
        
        // Ejecutar bridge
        stargateRouter.swap{value: msg.value}(
            targetChain,
            srcPoolId,
            dstPoolId,
            payable(msg.sender),
            amount,
            0,
            abi.encodePacked(address(this)),
            payload
        );
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
            uint16 targetChain,
            uint256 srcPoolId,
            uint256 dstPoolId
        ) = abi.decode(params, (address, uint16, uint256, uint256));

        // Ejecutar swap en la cadena origen
        uint256 amountReceived = _executeSourceSwap(
            asset,
            tokenOut,
            amount
        );

        // Iniciar bridge a la cadena destino
        _bridgeToTargetChain(
            targetChain,
            srcPoolId,
            dstPoolId,
            amountReceived
        );

        // Emitir evento
        emit CrossChainArbitrageStarted(
            asset,
            amount,
            targetChain,
            block.timestamp
        );

        // Aprobar repago del flash loan
        IERC20(asset).approve(address(POOL), amount + premium);
        
        return true;
    }

    /**
     * @notice Inicia el arbitraje cross-chain
     */
    function executeCrossChainArbitrage(
        address asset,
        uint256 amount,
        address tokenOut,
        uint16 targetChain,
        uint256 srcPoolId,
        uint256 dstPoolId
    ) external payable onlyOwner nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(supportedChains[targetChain], "Unsupported chain");
        
        bytes memory params = abi.encode(
            tokenOut,
            targetChain,
            srcPoolId,
            dstPoolId
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
            emit CrossChainArbitrageFailed(
                reason,
                block.timestamp
            );
        } catch (bytes memory reason) {
            emit CrossChainArbitrageFailed(
                string(reason),
                block.timestamp
            );
        }
    }

    /**
     * @notice Calcula el beneficio potencial cross-chain
     */
    function calculateCrossChainArbitrage(
        address tokenIn,
        address tokenOut,
        uint256 amount,
        uint256 targetChainPrice
    ) external view returns (uint256 profit, bool isProfit) {
        // Path para el swap
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;

        // Obtener cantidad de salida en DEX origen
        uint256[] memory amounts = sourceDex.getAmountsOut(amount, path);
        uint256 amountOut = amounts[1];

        // Calcular valor en la cadena destino
        uint256 targetValue = (amountOut * targetChainPrice) / 1e18;

        // Calcular costos
        uint256 aaveFee = (amount * AAVE_FEE) / 10000;
        uint256 estimatedBridgeFee = 50; // USD, aproximado

        // Calcular beneficio neto
        if (targetValue > (amount + aaveFee + estimatedBridgeFee)) {
            profit = targetValue - (amount + aaveFee + estimatedBridgeFee);
            isProfit = true;
        }

        return (profit, isProfit);
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