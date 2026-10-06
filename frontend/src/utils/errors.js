import { ethers } from 'ethers'
import { CONTRACT_ABIS, ROLE_NAMES } from '../contracts/config'

const ROLE_BY_HASH = Object.fromEntries(
  ROLE_NAMES.map((name) => [
    name === 'DEFAULT_ADMIN_ROLE' ? ethers.ZeroHash : ethers.id(name),
    name,
  ])
)

// Every custom error any FIE contract can revert with
const ERRORS_INTERFACE = new ethers.Interface([
  ...new Set(Object.values(CONTRACT_ABIS).flat().filter((f) => f.startsWith('error '))),
])

/**
 * ethers decodes custom errors only for static calls. A sent transaction that
 * fails gas estimation carries the raw revert data instead, so decode it here.
 */
function decodeCustomError(err) {
  if (err.revert?.name) return err.revert
  const data = typeof err.data === 'string' ? err.data : err.info?.error?.data
  if (typeof data !== 'string' || !data.startsWith('0x') || data.length < 10) return null
  try {
    return ERRORS_INTERFACE.parseError(data)
  } catch {
    return null
  }
}

/**
 * Turns an ethers/wallet error into a sentence a user can act on, preferring
 * the contract's own revert reason ("Corpus window must be 5-10 years") over
 * generic RPC noise.
 */
export function getErrorMessage(err) {
  if (!err) return 'Unknown error'

  if (err.code === 'ACTION_REJECTED' || err.info?.error?.code === 4001 || err.code === 4001) {
    return 'Transaction rejected in your wallet.'
  }

  // require(..., "reason")
  if (err.reason) return err.reason

  // Custom errors (e.g. OpenZeppelin AccessControl)
  const customError = decodeCustomError(err)
  if (customError) {
    const { name, args } = customError
    if (name === 'AccessControlUnauthorizedAccount') {
      const role = ROLE_BY_HASH[args?.[1]] ?? 'a required role'
      return `This account does not hold ${role}, which this action requires. ` +
        'Operator actions must be sent from an account that was granted the role.'
    }
    if (name === 'OwnableUnauthorizedAccount') {
      return 'Only the contract owner can perform this action.'
    }
    return `Contract rejected the call (${name}).`
  }

  if (err.code === 'INSUFFICIENT_FUNDS') return 'Insufficient funds to pay for this transaction.'
  if (err.code === 'NETWORK_ERROR') return 'Network error. Check that your wallet is on the right network.'
  if (err.code === 'BAD_DATA') {
    return 'Unexpected response from the contract. Check that the contract addresses match the connected network.'
  }

  return err.shortMessage || err.message || String(err)
}
