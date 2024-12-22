// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IPoolAddressesProvider {
    function getPool() external view returns (address);
}

contract MockAavePool {
    address public immutable ADDRESSES_PROVIDER;
    uint256 private constant FLASHLOAN_PREMIUM_TOTAL = 5; // 0.05%

    constructor() {
        ADDRESSES_PROVIDER = address(this);
    }

    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16 referralCode
    ) external {
        // Calcular la prima
        uint256 premium = (amount * FLASHLOAN_PREMIUM_TOTAL) / 10000;
        uint256 amountPlusPremium = amount + premium;

        // Transferir tokens al receptor
        IERC20(asset).transfer(receiverAddress, amount);

        // Ejecutar la operación
        require(
            executeOperation(
                receiverAddress,
                asset,
                amount,
                premium,
                msg.sender,
                params
            ),
            "Flash loan failed"
        );

        // Recuperar tokens + prima
        require(
            IERC20(asset).transferFrom(receiverAddress, address(this), amountPlusPremium),
            "Repayment failed"
        );
    }

    function executeOperation(
        address receiverAddress,
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) internal returns (bool) {
        // Llamar al callback del receptor
        bytes memory data = abi.encodeWithSignature(
            "executeOperation(address,uint256,uint256,address,bytes)",
            asset,
            amount,
            premium,
            initiator,
            params
        );

        (bool success, bytes memory result) = receiverAddress.call(data);
        require(success, "Callback failed");

        bool isSuccess = abi.decode(result, (bool));
        require(isSuccess, "Operation failed");

        return true;
    }

    function getPool() external view returns (address) {
        return address(this);
    }
} 