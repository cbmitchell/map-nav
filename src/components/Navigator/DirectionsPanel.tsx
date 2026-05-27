import type { Building } from '../../types/graph';
import styles from './DirectionsPanel.module.css';

interface DirectionsPanelProps {
  building: Building;
  path: string[];
}

interface WaypointStep {
  label: string;
  kind: 'start' | 'arrive' | 'transition' | 'waypoint';
}

export function DirectionsPanel({ building, path }: DirectionsPanelProps) {
  const nodeIndex = new Map(building.nodes.map((n) => [n.id, n]));
  const sectionIndex = new Map(building.sections.map((s) => [s.id, s]));

  // Build edge lookup: "srcId|tgtId" (both orders) → edge
  const edgeByPair = new Map<string, (typeof building.edges)[number]>();
  for (const edge of building.edges) {
    edgeByPair.set(`${edge.srcId}|${edge.tgtId}`, edge);
    edgeByPair.set(`${edge.tgtId}|${edge.srcId}`, edge);
  }

  const steps: WaypointStep[] = [];

  for (let i = 0; i < path.length; i++) {
    const node = nodeIndex.get(path[i]);
    if (!node) continue;

    if (i === 0) {
      steps.push({ kind: 'start', label: `Start at ${node.label || '(origin)'}` });
      continue;
    }

    if (i === path.length - 1) {
      steps.push({ kind: 'arrive', label: `Arrive at ${node.label || '(destination)'}` });
      continue;
    }

    // Find edge from previous node to this one
    const edge = edgeByPair.get(`${path[i - 1]}|${path[i]}`);
    const prevNode = nodeIndex.get(path[i - 1]);

    // Section transition
    if (edge?.crossSection || (prevNode && prevNode.sectionId !== node.sectionId)) {
      const sectionName = sectionIndex.get(node.sectionId)?.name ?? 'next section';
      const edgeTypeName = edge ? capitalize(edge.type) : 'Transition';
      steps.push({ kind: 'transition', label: `Take the ${edgeTypeName} to ${sectionName}` });
      continue;
    }

    // Labeled or connector intermediate node
    if (node.label || node.isConnector) {
      const desc = node.label ? `Continue to ${node.label}` : 'Pass through connector';
      steps.push({ kind: 'waypoint', label: desc });
    }
    // Unlabeled walkway node — silently skip
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>Directions</div>
      <ol className={styles.list}>
        {steps.map((step, i) => (
          <li key={i} className={styles.step} style={kindStyle(step.kind)}>
            {step.label}
          </li>
        ))}
      </ol>
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function kindStyle(kind: WaypointStep['kind']): React.CSSProperties {
  switch (kind) {
    case 'start':
    case 'arrive':
      return { color: '#EF9F27', fontWeight: 600 };
    case 'transition':
      return { color: '#534AB7' };
    default:
      return {};
  }
}

