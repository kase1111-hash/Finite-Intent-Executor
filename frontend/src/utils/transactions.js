import toast from 'react-hot-toast'
import { getErrorMessage } from './errors'

/**
 * Sends a transaction with loading, success and error toasts sharing one id,
 * so a failed transaction never leaves a spinner behind.
 *
 * @param {Promise} txPromise - The pending contract call, e.g. contract.foo(...)
 * @param {object} messages
 * @param {string} messages.id - Toast id
 * @param {string} messages.pending - Shown while the transaction is mined
 * @param {string} messages.success - Shown once it is mined
 * @param {string} messages.failure - Prefix for the error message
 * @param {(receipt: object) => string|null} [messages.inspect] - Returns a
 *   warning to show instead of `success` when the mined transaction did not do
 *   what was asked (e.g. an execution that defaulted to inaction).
 * @returns {Promise<object|null>} The receipt, or null if the transaction failed.
 */
export async function sendTx(txPromise, { id, pending, success, failure, inspect }) {
  try {
    const tx = await txPromise
    toast.loading(pending, { id })
    const receipt = await tx.wait()
    const warning = inspect?.(receipt)
    if (warning) {
      toast(warning, { id, icon: '⚠️', duration: 8000 })
    } else {
      toast.success(success, { id })
    }
    return receipt
  } catch (err) {
    console.error(failure, err)
    toast.error(`${failure}: ${getErrorMessage(err)}`, { id })
    return null
  }
}

/**
 * Finds an ExecutionAgent InactionDefault event in a receipt. Execution calls
 * whose corpus confidence is below the 95% threshold succeed on-chain but do
 * nothing; callers must not report them as executed.
 *
 * @returns {{reason: string, confidence: number} | null}
 */
export function findInaction(receipt, executionAgent) {
  for (const log of receipt?.logs ?? []) {
    try {
      const parsed = executionAgent.interface.parseLog(log)
      if (parsed?.name === 'InactionDefault') {
        return { reason: parsed.args.reason, confidence: Number(parsed.args.confidence) }
      }
    } catch {
      // Log from another contract
    }
  }
  return null
}
