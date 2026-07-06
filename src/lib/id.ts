/**
 * Sortable, URL-safe id generator.
 * Format: timestamp(36) + random(8). Stable for IndexedDB primary keys.
 */
export function newId(): string {
  const ts = Date.now().toString(36);
  const rand = crypto.getRandomValues(new Uint8Array(6));
  let suffix = "";
  for (const b of rand) {
    suffix += b.toString(36).padStart(2, "0").slice(-2);
  }
  return `${ts}-${suffix}`;
}
