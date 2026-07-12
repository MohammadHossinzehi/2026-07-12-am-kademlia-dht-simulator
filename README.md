# Kademlia DHT Simulator

A from-scratch implementation of the [Kademlia](https://en.wikipedia.org/wiki/Kademlia) distributed hash table algorithm (Maymounkov & MaziÃ¨res, 2002) in plain JavaScript, with zero runtime dependencies: XOR-distance routing, k-buckets with LRU eviction, the iterative `FIND_NODE`/`FIND_VALUE` lookup procedure, and a `PUT`/`GET` key-value store built on top of it. It ships with a full test suite and an interactive browser visualizer that runs the exact same code the tests exercise.

## What it does, and why it's useful

Kademlia is the routing algorithm underneath BitTorrent's trackerless DHT, IPFS, and Ethereum's node discovery protocol. Its core trick is a distance metric -- XOR of two node IDs -- that is simultaneously a valid metric space (symmetric, satisfies the triangle inequality) *and* aligned with binary prefix matching, which lets every node maintain a small, structured routing table (`O(log n)` buckets) while still being able to route a lookup to the right destination in `O(log n)` hops, without any central coordinator.

This project simulates a network of nodes in a single process (no real sockets), which makes the algorithm's behavior observable and testable in a way a real P2P network isn't: you can spin up hundreds of nodes instantly, take any of them offline mid-lookup, and assert on exactly which RPCs were sent and in what order.

What's implemented:

- **XOR metric & bucket assignment** (`src/distance.js`) -- distance, bucket index, and a small FNV-1a based `hashKey` for mapping string keys into the ID space.
- **K-buckets with proper LRU eviction** (`src/kBucket.js`) -- least-recently-seen contact is challenged with a ping before a new contact is ever allowed to evict it, exactly as the paper specifies (this is what makes Kademlia resistant to naive flooding by new/malicious nodes).
- **Routing table** (`src/routingTable.js`) -- one bucket per bit of the ID space, `closest(target, n)` for shortlist construction.
- **Simulated network transport** (`src/network.js`) -- stands in for UDP; implements the four RPCs (`PING`, `FIND_NODE`, `STORE`, `FIND_VALUE`) and can mark any node offline to simulate churn.
- **Node** (`src/node.js`) -- the RPC handlers a real Kademlia client would expose, plus "every RPC teaches you about its sender" contact learning.
- **Iterative lookup** (`src/lookup.js`) -- the `alpha`-way concurrent lookup procedure that converges on the true k nearest nodes to a target, `joinNetwork` (bootstrap-and-self-lookup), and `put`/`get` built on top of it.
- **Browser visualizer** (`web/`) -- watch a lookup fan out hop by hop, inspect any node's routing table, and try PUT/GET live.

## How to run it

Requires Node.js 18+, no `npm install` needed (zero dependencies).

```bash
# Run the test suite (29 tests)
npm test

# Run the CLI demo: builds a 60-node network, stores and retrieves
# several keys, and sanity-checks lookup results against a brute-force scan
npm start

# Launch the interactive browser visualizer
npx serve web
# (or: python3 -m http.server --directory web 8000)
# then open the printed URL in your browser
```

The browser demo needs to be served over HTTP (not opened as a `file://` URL) because it uses native ES module imports, which browsers block from `file://` origins.

## Design decisions

**16-bit ID space instead of 160-bit.** The real Kademlia/Bittorrent DHT hashes node IDs and keys into a 160-bit SHA-1 space. This simulator uses a 16-bit space (`ID_BITS` in `src/distance.js`, IDs 0-65535) so that a full network, its per-node routing tables, and lookup traces stay small enough to construct in a test, print in a terminal, and draw on a canvas -- while every structural property (the XOR metric, bucket-per-shared-prefix-length, iterative lookup convergence) is identical to the full-size version. Bumping `ID_BITS` back to 160 requires no algorithm changes, only a real hash function and bigint arithmetic in `distance.js`.

**`closest()` is a linear scan, not a real B-tree/trie lookup.** `RoutingTable.closest()` sorts every known contact by distance rather than doing the bucket-order traversal a production implementation would use for `O(log n)` closest-node queries. For a simulator capped at a few hundred nodes this is simpler to read and doesn't materially change what's being tested (routing *correctness*, not routing *throughput*).

**Eviction semantics are explicit and testable.** A full bucket doesn't silently reject or silently evict; `KBucket.update()` returns the least-recently-seen contact and the caller must resolve the eviction with a liveness result (`resolveEviction`). This mirrors the real RPC round-trip a production node would need before evicting a contact, and it's directly unit-tested (`test/kBucket.test.js`, `test/routingTable.test.js`) by supplying a fake ping function.

**`put()` only reports nodes that acknowledged the STORE.** If the iterative lookup's shortlist includes a node that has since gone offline, the `STORE` RPC to it simply fails (returns `false`, like a dropped UDP packet) and it's excluded from the returned target list -- `test/network.test.js` exercises this directly by taking the key's closest node offline before writing.

## Testing

`npm test` runs 29 tests over `node`'s built-in test runner (`node:test`), no test framework dependency:

- **`distance.test.js`** -- metric properties (symmetry, triangle inequality via random sampling), bucket index correctness, `hashKey` determinism.
- **`kBucket.test.js`** / **`routingTable.test.js`** -- LRU ordering, full-bucket eviction with both "head alive" and "head dead" outcomes.
- **`lookup.test.js`** -- exact-match convergence when the origin already knows every node; a *statistical* convergence check (>=85% top-1 accuracy across 40 random 120-node networks) for the realistic multi-hop bootstrap case, since Kademlia lookups are best-effort under sparse routing tables and an occasional miss is expected, not a bug; `join`/`put`/`get` round trips.
- **`network.test.js`** -- offline-node handling for every RPC type, and an end-to-end resilience test that takes the key's closest node offline and confirms `put`/`get` route around it.

The statistical test is intentionally not a flaky single-shot assertion: it measures accuracy over many trials and asserts against a threshold well below the empirically observed ~99%, so it has a wide margin before it would ever fail on correct code.

## Project layout

```
src/
  distance.js       XOR metric, bucket index, key hashing
  kBucket.js         Single k-bucket with LRU + eviction protocol
  routingTable.js    Per-node table of ID_BITS k-buckets
  node.js            DHTNode: RPC handlers
  network.js         In-process RPC transport (PING/FIND_NODE/STORE/FIND_VALUE)
  lookup.js          Iterative lookup, join, put, get
  buildNetwork.js    Helper to build & bootstrap a random network
  index.js           CLI demo
test/
  *.test.js          node:test suite (29 tests)
web/
  index.html, app.js, style.css   Browser visualizer (imports src/ directly)
```
