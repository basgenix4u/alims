import type { LineageGraph } from '@/lib/api-client';

export type Vec3 = { x: number; y: number; z: number };

export type LaidOutNode = {
  id: string;
  title: string;
  position: Vec3;
  outputType?: string;
  status?: string;
};

export type LaidOutEdge = {
  from: string;
  to: string;
  relType: string;
  evidenceState: string;
  a: Vec3;
  b: Vec3;
};

export type LineageLayout = {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
};

/**
 * Deterministic 3D layout: hash node ids onto a sphere, then pull
 * related nodes closer. No randomness — tests and SSR stay stable.
 */
export function layoutLineage(graph: LineageGraph): LineageLayout {
  const nodes: LaidOutNode[] = graph.nodes.map((node, index) => {
    const seed = hash32(node.id);
    const theta = (seed % 6283) / 1000 + index * 0.37;
    const phi = ((Math.floor(seed / 6283) % 3141) / 1000) * 0.9 + 0.2;
    const radius = 1.6 + (graph.nodes.length > 8 ? 0.08 * graph.nodes.length : 0);
    return {
      id: node.id,
      title: node.title ?? node.nxrId ?? node.id,
      outputType: node.outputType,
      status: node.status,
      position: {
        x: radius * Math.sin(phi) * Math.cos(theta),
        y: radius * Math.cos(phi),
        z: radius * Math.sin(phi) * Math.sin(theta),
      },
    };
  });

  const byId = new Map(nodes.map((n) => [n.id, n]));

  for (const edge of graph.edges) {
    const a = byId.get(edge.from);
    const b = byId.get(edge.to);
    if (!a || !b) continue;
    a.position = mix(a.position, b.position, 0.12);
    b.position = mix(b.position, a.position, 0.12);
  }

  const edges: LaidOutEdge[] = graph.edges.flatMap((edge) => {
    const a = byId.get(edge.from);
    const b = byId.get(edge.to);
    if (!a || !b) return [];
    return [
      {
        from: edge.from,
        to: edge.to,
        relType: edge.relType,
        evidenceState: edge.evidenceState ?? 'self_declared',
        a: a.position,
        b: b.position,
      },
    ];
  });

  return { nodes, edges };
}

function mix(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function hash32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
