import ELK from 'elkjs/lib/elk.bundled.js';
import type { Node, Edge } from '@xyflow/react';

const elk = new ELK();

const NODE_DIMS: Record<string, { width: number; height: number }> = {
  collatedPrompt: { width: 340, height: 232 },
  orchestrator: { width: 320, height: 200 },
  sceneGroup: { width: 260, height: 108 },
  frame: { width: 240, height: 342 },
  video: { width: 240, height: 272 },
};

const FALLBACK = { width: 200, height: 100 };

export async function layoutGraph(
  nodes: Node[],
  edges: Edge[],
): Promise<Node[]> {
  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': '52',
      'elk.layered.spacing.nodeNodeBetweenLayers': '88',
      'elk.layered.spacing.edgeNodeBetweenLayers': '40',
      'elk.edgeRouting': 'SPLINES',
    },
    children: nodes.map((n) => {
      const d = NODE_DIMS[n.type ?? ''] ?? FALLBACK;
      return { id: n.id, width: d.width, height: d.height };
    }),
    edges: edges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  };

  const laid = await elk.layout(graph);

  return nodes.map((n) => {
    const elkN = laid.children?.find((c) => c.id === n.id);
    return { ...n, position: { x: elkN?.x ?? 0, y: elkN?.y ?? 0 } };
  });
}
