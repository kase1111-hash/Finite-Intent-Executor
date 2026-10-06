import hre from "hardhat";

/**
 * Prints the deployed bytecode size of every project contract against the
 * EIP-170 limit (24,576 bytes). A contract over the limit cannot be deployed.
 *
 * Usage: npm run size
 */
const LIMIT = 24_576;

const rows = [];
for (const name of await hre.artifacts.getAllFullyQualifiedNames()) {
  if (!name.startsWith("contracts/")) continue;
  const { contractName, deployedBytecode } = await hre.artifacts.readArtifact(name);
  const size = (deployedBytecode.length - 2) / 2;
  if (size > 0) rows.push({ contractName, size });
}

rows.sort((a, b) => b.size - a.size);
const width = Math.max(...rows.map((r) => r.contractName.length));
console.log(`${"Contract".padEnd(width)}  Size (KiB)  % of limit`);
for (const { contractName, size } of rows) {
  const flag = size > LIMIT ? "  OVER LIMIT" : "";
  console.log(
    `${contractName.padEnd(width)}  ${(size / 1024).toFixed(2).padStart(10)}  ${((size / LIMIT) * 100).toFixed(1).padStart(9)}%${flag}`
  );
}

if (rows.some((r) => r.size > LIMIT)) {
  process.exitCode = 1;
}
