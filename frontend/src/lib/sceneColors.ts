/** Six subtle accent colors for scene grouping (border + edges). */
export const SCENE_ACCENTS = [
  '#ff5b00',
  '#a855f7',
  '#14b8a6',
  '#f43f5e',
  '#f59e0b',
  '#38bdf8',
] as const;

export function sceneAccent(sceneIndex: number): string {
  return SCENE_ACCENTS[sceneIndex % SCENE_ACCENTS.length]!;
}
