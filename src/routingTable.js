import { ID_BITS, bucketIndexFor, sortByDistance } from "./distance.js";
import { KBucket } from "./kBucket.js";

/**
 * A node's routing table: ID_BITS buckets, bucket i holding contacts whose
 * XOR distance to `selfId` is in [2^i, 2^(i+1)). Bucket ID_BITS-1 holds the
 * "farthest" contacts (differ in the top bit); bucket 0 holds the contacts
 * that differ from us in only the lowest bit, i.e. our nearest neighbours
 * in the keyspace.
 */
export class RoutingTable {
  constructor(selfId, k = 4) {
    this.selfId = selfId;
    this.k = k;
    this.buckets = Array.from({ length: ID_BITS }, () => new KBucket(k));
  }

  bucketFor(otherId) {
    return this.buckets[bucketIndexFor(this.selfId, otherId)];
  }

  /**
   * Record a sighting of `otherId`. `pingFn`, if provided, is called as
   * `pingFn(headId) => boolean` when the bucket is full and eviction must
   * be decided; if omitted, a full bucket simply keeps its current
   * contacts (new contact is dropped), which is the safe default for
   * synchronous callers that don't want to simulate a ping round-trip.
   */
  update(otherId, pingFn = null) {
    if (otherId === this.selfId) return;
    const bucket = this.bucketFor(otherId);
    const pendingHead = bucket.update(otherId);
    if (pendingHead === null) return;
    const alive = pingFn ? pingFn(pendingHead) : true;
    bucket.resolveEviction(pendingHead, alive, otherId);
  }

  remove(otherId) {
    this.bucketFor(otherId).remove(otherId);
  }

  allContacts() {
    return this.buckets.flatMap((b) => b.contacts);
  }

  /** The `count` known contacts closest to `target`, closest first. */
  closest(target, count) {
    return sortByDistance(this.allContacts(), target).slice(0, count);
  }
}
