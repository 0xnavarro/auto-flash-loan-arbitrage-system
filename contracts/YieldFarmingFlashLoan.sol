// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@aave/core-v3/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol";
import "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import "@aave/core-v3/contracts/interfaces/IPool.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract YieldFarmingFlashLoan is FlashLoanSimpleReceiverBase, ReentrancyGuard {
    address public owner;
    
    // El protocolo donde haremos yield farming (ejemplo: Compound)
    address public yieldProtocol;
    
    // El token de recompensa del protocolo
    address public rewardToken;

    constructor(
        address _addressProvider,
        address _yieldProtocol,
        address _rewardToken
    ) FlashLoanSimpleReceiverBase(IPoolAddressesProvider(_addressProvider)) {
        owner = msg.sender;
        yieldProtocol = _yieldProtocol;
        rewardToken = _rewardToken;
    }

    /**
     * Este método será llamado después de recibir el flash loan
     */
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        // 1. Depositamos en el protocolo de yield farming
        IERC20(asset).approve(yieldProtocol, amount);
        // Aquí iría la llamada al depósito en el protocolo específico
        
        // 2. Reclamamos las recompensas
        // Aquí iría la llamada para reclamar recompensas
        
        // 3. Retiramos los fondos
        // Aquí iría la llamada para retirar los fondos
        
        // 4. Aprobamos el repago del flash loan
        uint256 amountToRepay = amount + premium;
        IERC20(asset).approve(address(POOL), amountToRepay);
        
        return true;
    }

    /**
     * Función para iniciar el flash loan
     */
    function executeFlashLoan(
        address asset,
        uint256 amount
    ) external {
        require(msg.sender == owner, "Solo el owner puede ejecutar esto");
        bytes memory params = "";
        POOL.flashLoanSimple(
            address(this),
            asset,
            amount,
            params,
            0
        );
    }

    /**
     * Función para retirar las recompensas acumuladas
     */
    function withdrawRewards() external {
        require(msg.sender == owner, "Solo el owner puede retirar");
        uint256 rewardBalance = IERC20(rewardToken).balanceOf(address(this));
        IERC20(rewardToken).transfer(owner, rewardBalance);
    }

    /**
     * Función de emergencia para retirar tokens atrapados
     */
    function emergencyWithdraw(address token) external {
        require(msg.sender == owner, "Solo el owner puede ejecutar esto");
        uint256 balance = IERC20(token).balanceOf(address(this));
        IERC20(token).transfer(owner, balance);
    }
} 