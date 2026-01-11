// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract OmegaBridge is Ownable, ReentrancyGuard {
    event Locked(address indexed sender, uint256 amount, string solanaAddress);
    event Released(address indexed recipient, uint256 amount);

    constructor(address initialOwner) Ownable(initialOwner) {}

    /**
     * @dev Locks native Omega tokens in the contract to be bridged to Solana.
     * @param solanaAddress The recipient address on Solana (e.g., Base58 string).
     */
    function lock(string memory solanaAddress) external payable nonReentrant {
        require(msg.value > 0, "Amount must be greater than 0");
        emit Locked(msg.sender, msg.value, solanaAddress);
    }

    /**
     * @dev Releases native Omega tokens to a user (called by the Relayer).
     * @param recipient The recipient address on Omega Network.
     * @param amount The amount to release (in wei).
     */
    function release(address payable recipient, uint256 amount) external onlyOwner nonReentrant {
        require(address(this).balance >= amount, "Insufficient bridge balance");
        
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Transfer failed");
        
        emit Released(recipient, amount);
    }

    /**
     * @dev Emergency withdraw logic for the owner.
     */
    function withdraw(uint256 amount) external onlyOwner {
        require(address(this).balance >= amount, "Insufficient balance");
        (bool success, ) = owner().call{value: amount}("");
        require(success, "Transfer failed");
    }

    // Allow the contract to receive funds directly if needed (though lock is preferred)
    receive() external payable {}
}
