// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@aave/core-v3/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol";
import "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import "@aave/core-v3/contracts/interfaces/IPool.sol";
import "@aave/core-v3/contracts/interfaces/IAaveOracle.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title FlashDumpPump
 * @dev Contrato para liquidar posiciones apalancadas usando flash loans
 * Autor: C. Navarro
 */
contract FlashDumpPump is FlashLoanSimpleReceiverBase, Ownable {
    // Interface para el oráculo de Aave
    IAaveOracle public aaveOracle;
    
    // Estructura para almacenar información de liquidación
    struct LiquidationParams {
        address collateralAsset;
        address debtAsset;
        address userToLiquidate;
        uint256 debtToCover;
        bool receiveAToken;
    }

    // Eventos para seguimiento
    event LiquidationExecuted(
        address indexed user,
        address indexed collateralAsset,
        address indexed debtAsset,
        uint256 debtAmount,
        uint256 collateralReceived
    );

    event ProfitTaken(
        address token,
        uint256 amount
    );

    constructor(
        address _addressProvider
    ) FlashLoanSimpleReceiverBase(IPoolAddressesProvider(_addressProvider)) Ownable(msg.sender) {
        aaveOracle = IAaveOracle(IPoolAddressesProvider(_addressProvider).getPriceOracle());
    }

    /**
     * @dev Ejecuta la operación de flash loan
     */
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        // Decodificar parámetros de liquidación
        LiquidationParams memory liquidationParams = abi.decode(params, (LiquidationParams));

        // 1. Aprobar el gasto del token de deuda para la liquidación
        IERC20(asset).approve(address(POOL), amount);

        // 2. Ejecutar la liquidación
        POOL.liquidationCall(
            liquidationParams.collateralAsset,
            liquidationParams.debtAsset,
            liquidationParams.userToLiquidate,
            liquidationParams.debtToCover,
            liquidationParams.receiveAToken
        );

        // 3. Calcular la cantidad a devolver
        uint256 amountToRepay = amount + premium;

        // 4. Verificar que tenemos suficiente colateral para repagar
        uint256 collateralBalance = IERC20(liquidationParams.collateralAsset).balanceOf(address(this));
        require(collateralBalance > 0, "No collateral received");

        // 5. Vender el colateral recibido para obtener el token original
        _sellCollateral(
            liquidationParams.collateralAsset,
            asset,
            collateralBalance,
            amountToRepay
        );

        // 6. Aprobar el repago del flash loan
        IERC20(asset).approve(address(POOL), amountToRepay);

        // Emitir evento de liquidación exitosa
        emit LiquidationExecuted(
            liquidationParams.userToLiquidate,
            liquidationParams.collateralAsset,
            liquidationParams.debtAsset,
            amount,
            collateralBalance
        );

        return true;
    }

    /**
     * @dev Función para iniciar la liquidación con flash loan
     */
    function executeLiquidation(
        address collateralAsset,
        address debtAsset,
        address userToLiquidate,
        uint256 debtToCover
    ) external onlyOwner {
        // Verificar que la posición es liquidable
        require(_isLiquidatable(userToLiquidate, collateralAsset, debtAsset), "Position not liquidatable");

        // Preparar parámetros de liquidación
        LiquidationParams memory params = LiquidationParams({
            collateralAsset: collateralAsset,
            debtAsset: debtAsset,
            userToLiquidate: userToLiquidate,
            debtToCover: debtToCover,
            receiveAToken: false
        });

        // Solicitar flash loan
        bytes memory encodedParams = abi.encode(params);
        POOL.flashLoanSimple(
            address(this),
            debtAsset,
            debtToCover,
            encodedParams,
            0
        );
    }

    /**
     * @dev Verifica si una posición es liquidable
     */
    function _isLiquidatable(
        address user,
        address collateralAsset,
        address debtAsset
    ) internal view returns (bool) {
        (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        ) = POOL.getUserAccountData(user);

        // Una posición es liquidable si el health factor es menor a 1
        return healthFactor < 1e18;
    }

    /**
     * @dev Vende el colateral recibido (implementar lógica de DEX aquí)
     */
    function _sellCollateral(
        address collateralAsset,
        address debtAsset,
        uint256 collateralAmount,
        uint256 minAmountOut
    ) internal {
        // TODO: Implementar la lógica de venta usando un DEX
        // Por ejemplo, usando Uniswap o cualquier otro DEX
        // Esta función debe vender el colateral y obtener suficiente debtAsset para repagar
    }

    /**
     * @dev Retira las ganancias al owner
     */
    function withdrawProfits(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "No profits to withdraw");
        
        IERC20(token).transfer(owner(), balance);
        emit ProfitTaken(token, balance);
    }

    /**
     * @dev Función de emergencia para retirar tokens
     */
    function emergencyWithdraw(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "No balance to withdraw");
        IERC20(token).transfer(owner(), balance);
    }
} 