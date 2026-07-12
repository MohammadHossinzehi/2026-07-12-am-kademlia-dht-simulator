// Core distance/metric utilities for the Kademlia XOR keyspace.
//
// The real Kademlia paper uses a 160-bit keyspace (SHA-1). This simulator
// uses a 16-bit keyspace (IDs 0..65535) so that a full network, its routing
// tables, and lookup traces are small enough to construct, test, and draw
// on a canvas -- while every structural property (XOR metric, bucket
// splitting by shared-prefix length, iterative lookup convergence) is
// identical to the full-size version.

export const ID_BITS = 16;
export const ID_SPACE = 1 << ID_BITS; // 65536

/**
 * XOR distance between two node/key IDs. This is Kademlia's metric: it is
 * symmetric, satisfies the triangle inequality, and unlike a simple
 * numeric difference it makes "closeness" align with shared binary prefix
 * length, which is what makes the bucket structure below work.
 */
export function distance(a, b) {
  return (a ^ b) >>> 0;
}

/**
 * Index (0..ID_BITS-1) of the highest set bit of d, i.e. floor(log2(d)).
 * This is the standard way Kademlia assigns a contact to bucket i such
 * that all contacts in bucket i are at distance in [2^i, 2^(i+1)).
 * d must be > 0 (callers never compute this for d === 0, i.e. a === b).
 */
export function highestSetBitIndex(d) {
  if (d <= 0) throw new RangeError("highestSetBitIndex requires d > 0");
  return 31 - Math.clz32(d);
}

/** Bucket index that `otherId` falls into within `selfId`'s routing table. */
export function bucketIndexFor(selfId, otherId) {
  const d = distance(selfId, otherId);
  if (d === 0) throw new RangeError("a node does not bucket itself");
  return highestSetBitIndex(d);
}

/** Sort a list of ids by XOR distance to target, closest first. */
export function sortByDistance(ids, target) {
  return [...ids].sort((a, b) => distance(a, target) - distance(b, target));
}

/** Deterministic 16-bit hash of an arbitrary string key, used to map
 * application keys (e.g. "hello") into the ID_BITS keyspace so they can be
 * stored at the nodes closest to hash(key). FNV-1a, folded down to 16 bits.
 */
export function hashKey(key) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // fold the 32-bit FNV hash into ID_BITS by xoring the halves together
  h = h >>> 0;
  return ((h & 0xffff) ^ (h >>> 16)) & (ID_SPACE - 1);
}
