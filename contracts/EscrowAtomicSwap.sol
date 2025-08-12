// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
}

contract EscrowAtomicSwap {
    error InsufficientAllowance();
    error ZeroAddress();
    error ZeroAmount();

    function settleAtomic(
        address tokenA,
        address tokenB,
        address makerA,
        address makerB,
        uint256 amountA, // makerA -> makerB
        uint256 amountB  // makerB -> makerA
    ) external {
        if (tokenA == address(0) || tokenB == address(0) || makerA == address(0) || makerB == address(0)) {
            revert ZeroAddress();
        }
        if (amountA == 0 || amountB == 0) revert ZeroAmount();

        IERC20 tA = IERC20(tokenA);
        IERC20 tB = IERC20(tokenB);

        // her iki taraf da önce approve vermiş olmalı
        if (tA.allowance(makerA, address(this)) < amountA) revert InsufficientAllowance();
        if (tB.allowance(makerB, address(this)) < amountB) revert InsufficientAllowance();

        // iki yönlü atomik takas
        // sıralama önemli değil; başarısız olursa tüm tx revert
        bool ok1 = tA.transferFrom(makerA, makerB, amountA);
        bool ok2 = tB.transferFrom(makerB, makerA, amountB);
        require(ok1 && ok2, "transfer failed");
    }
}
