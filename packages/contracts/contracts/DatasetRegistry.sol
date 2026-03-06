// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract DatasetRegistry is Ownable, ReentrancyGuard {

    enum LicenseType {
        Research,
        Commercial,
        OpenSource,
        Exclusive
    }

    struct Dataset {
        uint256 id;
        address creator;
        bytes32 manifestTxHash;
        uint256 priceWei;
        LicenseType licenseType;
        string name;
        string description;
        string contentType;
        uint256 fileSize;
        uint256 chunkCount;
        bytes32 fileHash;
        uint256 createdAt;
        bool active;
    }

    uint256 private _nextDatasetId;
    mapping(uint256 => Dataset) public datasets;
    mapping(address => uint256[]) public creatorDatasets;
    mapping(bytes32 => bool) public manifestRegistered;

    event DatasetPublished(uint256 indexed datasetId, address indexed creator, bytes32 manifestTxHash, uint256 priceWei, LicenseType licenseType, string name);
    event DatasetPriceUpdated(uint256 indexed datasetId, uint256 oldPrice, uint256 newPrice);
    event DatasetDeactivated(uint256 indexed datasetId);
    event DatasetReactivated(uint256 indexed datasetId);

    error NotDatasetCreator();
    error DatasetNotFound();
    error DatasetInactive();
    error ManifestAlreadyRegistered();
    error InvalidManifestHash();

    constructor() Ownable(msg.sender) {
        _nextDatasetId = 1;
    }

    function publishDataset(
        bytes32 manifestTxHash,
        uint256 priceWei,
        LicenseType licenseType,
        string calldata name,
        string calldata description,
        string calldata contentType,
        uint256 fileSize,
        uint256 chunkCount,
        bytes32 fileHash
    ) external nonReentrant returns (uint256 datasetId) {
        if (manifestTxHash == bytes32(0)) revert InvalidManifestHash();
        if (manifestRegistered[manifestTxHash]) revert ManifestAlreadyRegistered();

        datasetId = _nextDatasetId++;

        datasets[datasetId] = Dataset({
            id: datasetId,
            creator: msg.sender,
            manifestTxHash: manifestTxHash,
            priceWei: priceWei,
            licenseType: licenseType,
            name: name,
            description: description,
            contentType: contentType,
            fileSize: fileSize,
            chunkCount: chunkCount,
            fileHash: fileHash,
            createdAt: block.timestamp,
            active: true
        });

        manifestRegistered[manifestTxHash] = true;
        creatorDatasets[msg.sender].push(datasetId);

        emit DatasetPublished(datasetId, msg.sender, manifestTxHash, priceWei, licenseType, name);
    }

    function updatePrice(uint256 datasetId, uint256 newPriceWei) external {
        Dataset storage ds = _getActiveDataset(datasetId);
        if (ds.creator != msg.sender) revert NotDatasetCreator();
        uint256 oldPrice = ds.priceWei;
        ds.priceWei = newPriceWei;
        emit DatasetPriceUpdated(datasetId, oldPrice, newPriceWei);
    }

    function deactivateDataset(uint256 datasetId) external {
        Dataset storage ds = datasets[datasetId];
        if (ds.id == 0) revert DatasetNotFound();
        if (ds.creator != msg.sender && owner() != msg.sender) revert NotDatasetCreator();
        ds.active = false;
        emit DatasetDeactivated(datasetId);
    }

    function reactivateDataset(uint256 datasetId) external {
        Dataset storage ds = datasets[datasetId];
        if (ds.id == 0) revert DatasetNotFound();
        if (ds.creator != msg.sender) revert NotDatasetCreator();
        ds.active = true;
        emit DatasetReactivated(datasetId);
    }

    function getDataset(uint256 datasetId) external view returns (Dataset memory) {
        if (datasets[datasetId].id == 0) revert DatasetNotFound();
        return datasets[datasetId];
    }

    function getCreatorDatasets(address creator) external view returns (uint256[] memory) {
        return creatorDatasets[creator];
    }

    function totalDatasets() external view returns (uint256) {
        return _nextDatasetId - 1;
    }

    function _getActiveDataset(uint256 datasetId) internal view returns (Dataset storage) {
        Dataset storage ds = datasets[datasetId];
        if (ds.id == 0) revert DatasetNotFound();
        if (!ds.active) revert DatasetInactive();
        return ds;
    }
}