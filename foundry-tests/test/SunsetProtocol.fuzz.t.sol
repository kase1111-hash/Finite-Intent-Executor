// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../contracts/ExecutionAgent.sol";
import "../../contracts/LexiconHolder.sol";
import "../../contracts/SunsetProtocol.sol";

contract SunsetProtocolFuzzTest is Test {
    ExecutionAgent public executionAgent;
    LexiconHolder public lexiconHolder;
    SunsetProtocol public sunsetProtocol;

    address public executor;
    address public creator;

    bytes32 public corpusHash;

    uint256 constant TWENTY_YEARS = 20 * 365 days;
    uint256 constant MAX_ARCHIVE_BATCH_SIZE = 50;

    function setUp() public {
        lexiconHolder = new LexiconHolder();
        executionAgent = new ExecutionAgent(address(lexiconHolder));
        sunsetProtocol = new SunsetProtocol(
            address(executionAgent),
            address(lexiconHolder)
        );

        executor = makeAddr("executor");
        creator = makeAddr("creator");

        corpusHash = keccak256("test_corpus");

        // Grant EXECUTOR_ROLE on executionAgent
        executionAgent.grantRole(executionAgent.EXECUTOR_ROLE(), executor);

        // Grant SUNSET_OPERATOR_ROLE to this test contract
        sunsetProtocol.grantRole(sunsetProtocol.SUNSET_OPERATOR_ROLE(), address(this));

        // Grant INDEXER_ROLE on lexiconHolder to sunsetProtocol
        lexiconHolder.grantRole(lexiconHolder.INDEXER_ROLE(), address(sunsetProtocol));

        // Freeze corpus for creator
        lexiconHolder.freezeCorpus(
            creator,
            corpusHash,
            "ipfs://corpus",
            2020,
            2025
        );

        // Activate execution for creator
        vm.prank(executor);
        executionAgent.activateExecution(creator);
    }

    /// @notice Fuzz test: SUNSET_DURATION is always 20 * 365 days
    function testFuzz_SunsetDurationImmutable() public view {
        assertEq(
            sunsetProtocol.SUNSET_DURATION(),
            TWENTY_YEARS,
            "SUNSET_DURATION must always be 20 * 365 days"
        );
    }

    /// @notice Fuzz test: Sunset initiation only works after 20 years have elapsed
    function testFuzz_SunsetTimingBoundary(uint256 timeElapsed) public {
        vm.assume(timeElapsed <= TWENTY_YEARS + 365 days);

        vm.warp(block.timestamp + timeElapsed);

        if (timeElapsed < TWENTY_YEARS) {
            vm.expectRevert("20 year duration not elapsed");
            sunsetProtocol.initiateSunset(creator);
        } else {
            sunsetProtocol.initiateSunset(creator);

            SunsetProtocol.SunsetState memory state = sunsetProtocol.getSunsetState(creator);
            assertTrue(state.isSunset, "Sunset should be true after initiation");
        }
    }

    /// @notice Fuzz test: Archive batch sizes from 1 to MAX_ARCHIVE_BATCH_SIZE all work
    function testFuzz_ArchiveBatchSize(uint8 batchSize) public {
        vm.assume(batchSize >= 1 && batchSize <= MAX_ARCHIVE_BATCH_SIZE);

        // First initiate sunset
        vm.warp(block.timestamp + TWENTY_YEARS);
        sunsetProtocol.initiateSunset(creator);

        // Build arrays of the fuzzed batch size
        address[] memory assetAddresses = new address[](batchSize);
        string[] memory storageURIs = new string[](batchSize);
        bytes32[] memory assetHashes = new bytes32[](batchSize);

        for (uint256 i = 0; i < batchSize; i++) {
            assetAddresses[i] = address(uint160(i + 1));
            storageURIs[i] = "ipfs://asset";
            assetHashes[i] = keccak256(abi.encodePacked("asset", i));
        }

        sunsetProtocol.archiveAssets(creator, assetAddresses, storageURIs, assetHashes);

        SunsetProtocol.AssetArchive[] memory archived = sunsetProtocol.getArchivedAssets(creator);
        assertEq(archived.length, batchSize, "Archived asset count must match batch size");
    }

    /// @notice Invariant: Once sunset is true, it stays true (irreversible)
    function testInvariant_SunsetIrreversible() public {
        // Initiate sunset
        vm.warp(block.timestamp + TWENTY_YEARS);
        sunsetProtocol.initiateSunset(creator);

        SunsetProtocol.SunsetState memory state = sunsetProtocol.getSunsetState(creator);
        assertTrue(state.isSunset, "Sunset should be true after initiation");

        // Attempting to initiate sunset again should revert
        vm.expectRevert("Sunset already initiated");
        sunsetProtocol.initiateSunset(creator);

        // Verify it is still sunset
        state = sunsetProtocol.getSunsetState(creator);
        assertTrue(state.isSunset, "Sunset must remain true (irreversible)");
    }

    /// @notice Fuzz test: Only valid license types (0, 1, 2) work for transitionIP
    function testFuzz_LicenseTypeRange(uint8 licenseType) public {
        // Initiate sunset and archive assets first (required workflow)
        vm.warp(block.timestamp + TWENTY_YEARS);
        sunsetProtocol.initiateSunset(creator);

        // Archive at least one asset
        address[] memory assetAddresses = new address[](1);
        string[] memory storageURIs = new string[](1);
        bytes32[] memory assetHashes = new bytes32[](1);
        assetAddresses[0] = address(0x123);
        storageURIs[0] = "ipfs://asset0";
        assetHashes[0] = keccak256("asset0");

        sunsetProtocol.archiveAssets(creator, assetAddresses, storageURIs, assetHashes);
        sunsetProtocol.finalizeArchive(creator);

        if (licenseType <= 2) {
            // Valid enum values: CC0 (0), PublicDomain (1), NeutralStewardship (2)
            sunsetProtocol.transitionIP(creator, SunsetProtocol.LicenseType(licenseType));

            SunsetProtocol.SunsetState memory state = sunsetProtocol.getSunsetState(creator);
            assertTrue(state.ipTransitioned, "IP should be transitioned");
        } else {
            // Invalid enum values should revert
            vm.expectRevert();
            sunsetProtocol.transitionIP(creator, SunsetProtocol.LicenseType(licenseType));
        }
    }
}
