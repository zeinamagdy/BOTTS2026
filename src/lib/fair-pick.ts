import "server-only"
import { createHash, randomBytes } from "node:crypto"

/**
 * Fair Pick: among the applicants who meet every requirement, a random draw
 * decides the order, not a hidden score. Commit–reveal, so the landlord can't
 * redraw until they like the result and nobody can pick the order afterwards:
 *
 * 1. Commit: a random seed is generated and only its SHA-256 hash is shown
 *    (in a live system it goes to every applicant before the draw).
 * 2. Reveal: the seed is published. Anyone can check that sha256(seed) is the
 *    committed hash and recompute the order: the qualifying ids sorted by
 *    sha256(`${seed}:${id}`). Every place depends on the whole seed, so one
 *    applicant can't be moved without reshuffling everyone.
 *
 * The seed waits in an httpOnly cookie between the two steps (see
 * `commitFairPickAction`): serverless instances share no memory.
 */

export function sha256Hex(input: string) {
  return createHash("sha256").update(input).digest("hex")
}

export function newSeed() {
  return randomBytes(32).toString("hex")
}

/** Fingerprint of who is in the draw, independent of their order */
export function poolHash(ids: readonly string[]) {
  return sha256Hex([...ids].sort().join(","))
}

export function drawOrder(seed: string, ids: readonly string[]) {
  const key = new Map(ids.map((id) => [id, sha256Hex(`${seed}:${id}`)]))
  return [...ids].sort((a, b) =>
    key.get(a)! < key.get(b)! ? -1 : key.get(a)! > key.get(b)! ? 1 : 0,
  )
}

export function orderByDraw<T extends { id: string }>(
  seed: string,
  items: readonly T[],
) {
  const byId = new Map(items.map((x) => [x.id, x]))
  return drawOrder(
    seed,
    items.map((x) => x.id),
  ).map((id) => byId.get(id)!)
}
