// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract WrappedSecretSerpentSociety is ERC721URIStorage, Ownable {
    uint256 public tokenCounter;
    mapping(uint256 => string) public originalSolanaMint;

    event WrappedMinted(address indexed to, uint256 indexed tokenId, string solanaMint);
    event WrappedBurned(address indexed from, uint256 indexed tokenId, string solanaMint, string solanaDestination);

    constructor() ERC721("Wrapped Secret Serpent Society", "wSSS") Ownable(msg.sender) {
        tokenCounter = 0;
    }

    function mint(address to, string memory uri, string memory _solanaMint) external onlyOwner {
        uint256 newTokenId = tokenCounter;
        _safeMint(to, newTokenId);
        _setTokenURI(newTokenId, uri);
        originalSolanaMint[newTokenId] = _solanaMint;
        tokenCounter += 1;
        emit WrappedMinted(to, newTokenId, _solanaMint);
    }

    function updateTokenURI(uint256 tokenId, string memory newUri) external onlyOwner {
        _setTokenURI(tokenId, newUri);
    }

    function burnToSolana(uint256 tokenId, string memory solanaDestination) external {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        string memory solMint = originalSolanaMint[tokenId];
        _burn(tokenId);
        emit WrappedBurned(msg.sender, tokenId, solMint, solanaDestination);
    }
}
