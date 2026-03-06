// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./DatasetRegistry.sol";

contract LicenseMarket is Ownable, ReentrancyGuard {

    uint256 public constant FEE_BASIS_POINTS = 10_000;
    uint256 public constant PROTOCOL_FEE_BPS = 250; // 2.5%

    DatasetRegistry public immutable registry;
    address public treasury;

    mapping(uint256 => mapping(address => bytes32)) public licenseReceipts;
    mapping(uint256 => mapping(address => uint256)) public purchaseTimestamps;
    mapping(uint256 => uint256) public licenseCount;
    mapping(uint256 => uint256) public totalEarnings;
    uint256 public totalProtocolFees;

    event LicensePurchased(
        uint256 indexed datasetId,
        address indexed buyer,
        address indexed creator,
        bytes32 receiptTxHash,
        uint256 amountPaid,
        uint256 creatorShare,
        uint256 protocolFee
    );
    event TreasuryUpdated(address oldTreasury, address newTreasury);

    error AlreadyLicensed();
    error InsufficientPayment(uint256 required, uint256 sent);
    error InvalidReceiptHash();
    error TransferFailed();
    error ZeroAddress();

    constructor(address _registry, address _treasury) Ownable(msg.sender) {
        if (_registry == address(0) || _treasury == address(0)) revert ZeroAddress();
        registry = DatasetRegistry(_registry);
        treasury = _treasury;
    }

    function purchaseDataset(uint256 datasetId, bytes32 receiptTxHash)
        external
        payable
        nonReentrant
    {
        if (receiptTxHash == bytes32(0)) revert InvalidReceiptHash();
        if (licenseReceipts[datasetId][msg.sender] != bytes32(0)) revert AlreadyLicensed();

        DatasetRegistry.Dataset memory ds = registry.getDataset(datasetId);

        if (msg.value < ds.priceWei) revert InsufficientPayment(ds.priceWei, msg.value);

        uint256 protocolFee = (msg.value * PROTOCOL_FEE_BPS) / FEE_BASIS_POINTS;
        uint256 creatorShare = msg.value - protocolFee;

        licenseReceipts[datasetId][msg.sender] = receiptTxHash;
        purchaseTimestamps[datasetId][msg.sender] = block.timestamp;
        licenseCount[datasetId]++;
        totalEarnings[datasetId] += creatorShare;
        totalProtocolFees += protocolFee;

        (bool creatorOk,) = payable(ds.creator).call{value: creatorShare}("");
        if (!creatorOk) revert TransferFailed();

        (bool treasuryOk,) = payable(treasury).call{value: protocolFee}("");
        if (!treasuryOk) revert TransferFailed();

        emit LicensePurchased(datasetId, msg.sender, ds.creator, receiptTxHash, msg.value, creatorShare, protocolFee);
    }

    function verifyLicense(uint256 datasetId, address buyer) external view returns (bool) {
        return licenseReceipts[datasetId][buyer] != bytes32(0);
    }

    function getLicenseReceipt(uint256 datasetId, address buyer) external view returns (bytes32) {
        return licenseReceipts[datasetId][buyer];
    }

    function getLicenseInfo(uint256 datasetId, address buyer)
        external
        view
        returns (bool licensed, bytes32 receiptTxHash, uint256 purchasedAt)
    {
        receiptTxHash = licenseReceipts[datasetId][buyer];
        licensed = receiptTxHash != bytes32(0);
        purchasedAt = purchaseTimestamps[datasetId][buyer];
    }

    function getDatasetStats(uint256 datasetId) external view returns (uint256 licenses, uint256 earnings) {
        return (licenseCount[datasetId], totalEarnings[datasetId]);
    }

    function calculateFeeSplit(uint256 amountWei) external pure returns (uint256 creatorShare, uint256 protocolFee) {
        protocolFee = (amountWei * PROTOCOL_FEE_BPS) / FEE_BASIS_POINTS;
        creatorShare = amountWei - protocolFee;
    }

    function updateTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }
}