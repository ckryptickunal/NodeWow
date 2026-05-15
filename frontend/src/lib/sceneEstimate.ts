/** Heuristic scene count from free text — no API (debounced in UI). */
export function estimateSceneCount(text: string): number {
  const t = text.trim();
  if (!t) return 0;

  const blocks = t.split(/\n\n+/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length >= 2) return blocks.length;

  const rough = t.split(/(?<=[.!?])\s+/).filter((s) => s.length > 12);
  const n = Math.ceil(rough.length / 2);
  return Math.min(40, Math.max(1, n));
}
