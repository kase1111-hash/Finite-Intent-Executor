import { expect } from "chai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import hre from "hardhat";
import {
  FRONTEND_ABIS_PATH,
  buildFrontendAbis,
  renderAbisModule,
} from "../scripts/lib/frontendAbis.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("Frontend ABIs", function () {
  it("Should match the compiled contracts (run `npm run export-abis` if this fails)", async function () {
    const expected = renderAbisModule(await buildFrontendAbis(hre.artifacts));
    const actual = fs.readFileSync(path.join(root, FRONTEND_ABIS_PATH), "utf8");

    expect(actual).to.equal(expected);
  });
});
