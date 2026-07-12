// A single k-bucket: holds up to `k` contacts, ordered least-recently-seen
// (index 0) to most-recently-seen (last index), exactly as in the Kademlia
// paper. This ordering is the whole point of the design: it lets long-lived
// nodes accumulate in the "trusted" tail of the bucket, which is what makes
// Kademlia resistant to churn and to naive Sybil flooding (an attacker
// spamming new contacts cannot evict established good nodes -- they can
// only take a *free* slot or replace a contact that fails to answer a ping).

export class KBucket {
  constructor(k = 4) {
    this.k = k;
    /** @type {number[]} least-recently-seen first */
    this.contacts = [];
  }

  has(id) {
    return this.contacts.includes(id);
  }

  get size() {
    return this.contacts.length;
  }

  get isFull() {
    return this.contacts.length >= this.k;
  }

  /** Least-recently-seen contact, the one that gets pinged before eviction. */
  get head() {
    return this.contacts[0];
  }

  /**
   * Record that `id` was just seen (responded to a query or contacted us).
   * - If already present: move it to the most-recently-seen end.
   * - If not present and there's room: append it (most-recently-seen end).
   * - If not present and full: return the head so the caller can ping it;
   *   caller must then call `resolveEviction`.
   * Returns null if no eviction decision is pending, or the head id that
   * needs to be pinged before `id` can be admitted.
   */
  update(id) {
    const idx = this.contacts.indexOf(id);
    if (idx !== -1) {
      this.contacts.splice(idx, 1);
      this.contacts.push(id);
      return null;
    }
    if (!this.isFull) {
      this.contacts.push(id);
      return null;
    }
    return this.head; // caller must ping this before we can admit `id`
  }

  /**
   * Finish an eviction decision started by `update` returning a non-null
   * head. `headAlive` reflects whether the ping succeeded.
   *   - alive:  head is refreshed to most-recently-seen, candidate dropped.
   *   - dead:   head is evicted, candidate admitted at the tail.
   */
  resolveEviction(headId, headAlive, candidateId) {
    const idx = this.contacts.indexOf(headId);
    if (idx === -1) return; // already resolved/changed concurrently
    this.contacts.splice(idx, 1);
    if (headAlive) {
      this.contacts.push(headId);
    } else {
      this.contacts.push(candidateId);
    }
  }

  remove(id) {
    const idx = this.contacts.indexOf(id);
    if (idx !== -1) this.contacts.splice(idx, 1);
  }
}
