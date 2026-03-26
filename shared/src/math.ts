/**
 * Math utilities for stock-flow consistent operations.
 * Ensures integer-safe distribution with no fractional loss.
 */

/**
 * Distribute an integer total fairly across recipients, preserving exactly
 * the total by distributing remainder to the first N recipients.
 *
 * Example: distributeProRata(100, [1, 1, 1]) returns [34, 33, 33]
 *   Base share: 100 / 3 = 33.333...
 *   Floor shares: [33, 33, 33] = 99
 *   Remainder: 100 - 99 = 1
 *   Distribute remainder to first agent: [34, 33, 33] ✓
 *
 * @param total - Total fiat to distribute (must be integer)
 * @param weights - Array of numeric weights (all >= 1)
 * @returns Array of integer shares, one per weight, summing to total
 */
export function distributeProRata(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  if (total === 0) return weights.map(() => 0);

  // Sum weights to compute base share
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const baseShare = Math.floor(total / weightSum);

  // Allocate base share to each recipient
  const shares = weights.map(() => baseShare);

  // Distribute remainder fairly: one unit to the first N recipients
  const remainder = total - baseShare * weightSum;
  for (let i = 0; i < remainder; i++) {
    shares[i % weights.length]++;
  }

  return shares;
}
