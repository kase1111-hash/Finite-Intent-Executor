import hre from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  FRONTEND_ABIS_PATH,
  buildFrontendAbis,
  renderAbisModule,
} from "./lib/frontendAbis.js";

/**
 * Regenerates the dashboard's contract ABIs from the compiled contracts.
 *
 * Usage: npm run export-abis
 *
 * Run it after changing any contract's external interface, and commit the
 * result. test/FrontendAbis.test.js fails until you do.
 */
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, FRONTEND_ABIS_PATH);

const abis = await buildFrontendAbis(hre.artifacts);
fs.writeFileSync(outputPath, renderAbisModule(abis));

console.log(`Wrote ABIs for ${Object.keys(abis).length} contracts to ${FRONTEND_ABIS_PATH}`);
