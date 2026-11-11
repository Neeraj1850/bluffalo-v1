/** Agents with a real hand between commit and settle (per server process). Their stack is locked in the contract. */
export const inFlight = new Set<string>();
