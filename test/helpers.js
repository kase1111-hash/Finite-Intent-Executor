/**
 * Shared helpers for the Hardhat test suite.
 */

/**
 * Drives the deadman switch through its full commit-reveal flow.
 *
 * [Audit fix: M-9] executeDeadmanSwitch() requires the caller to have placed a
 * commitment at least COMMIT_REVEAL_DELAY blocks earlier, so tests cannot call
 * the reveal directly.
 *
 * @param triggerMechanism TriggerMechanism contract instance
 * @param creator Address of the intent creator
 * @param networkHelpers Hardhat network helpers (for mining the delay blocks)
 * @param signer Optional signer to execute as; defaults to the instance's signer
 */
export async function executeDeadmanSwitch(
  triggerMechanism,
  creator,
  networkHelpers,
  signer
) {
  const trigger =
    signer === undefined ? triggerMechanism : triggerMechanism.connect(signer);

  await trigger.commitDeadmanExecution(creator);
  const delay = await triggerMechanism.COMMIT_REVEAL_DELAY();
  await networkHelpers.mine(Number(delay));

  return trigger.executeDeadmanSwitch(creator);
}
