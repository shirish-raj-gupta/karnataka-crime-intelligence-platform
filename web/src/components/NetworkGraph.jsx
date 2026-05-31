import { useEffect, useRef, useState } from "react";

// Lightweight force-directed graph rendered to SVG. No external deps — a small
// Fruchterman-Reingold-style simulation positions nodes; good enough for a few
// hundred nodes and avoids pulling in a heavy graph library.
export default function NetworkGraph({ data, height = 520 }) {
  const ref = useRef(null);
  const [positions, setPositions] = useState(null);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    if (!data || !data.nodes || data.nodes.length === 0) { setPositions(null); return; }
    const W = 900, H = height;
    const nodes = data.nodes.map((n) => ({
      ...n,
      x: W / 2 + (Math.random() - 0.5) * 300,
      y: H / 2 + (Math.random() - 0.5) * 300,
      vx: 0, vy: 0,
    }));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const edges = data.edges
      .map((e) => ({ s: byId.get(e.source), t: byId.get(e.target), w: e.weight, relation: e.relation }))
      .filter((e) => e.s && e.t);

    // Simulation
    const k = 80; // ideal edge length
    for (let iter = 0; iter < 220; iter++) {
      // repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          let dx = a.x - b.x, dy = a.y - b.y;
          let dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
          const rep = (k * k) / dist / 12;
          dx /= dist; dy /= dist;
          a.vx += dx * rep; a.vy += dy * rep;
          b.vx -= dx * rep; b.vy -= dy * rep;
        }
      }
      // attraction along edges
      for (const e of edges) {
        let dx = e.s.x - e.t.x, dy = e.s.y - e.t.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const att = (dist * dist) / k / 90;
        dx /= dist; dy /= dist;
        e.s.vx -= dx * att; e.s.vy -= dy * att;
        e.t.vx += dx * att; e.t.vy += dy * att;
      }
      // integrate + gravity to centre
      for (const n of nodes) {
        n.vx += (W / 2 - n.x) * 0.002;
        n.vy += (H / 2 - n.y) * 0.002;
        n.x += Math.max(-12, Math.min(12, n.vx));
        n.y += Math.max(-12, Math.min(12, n.vy));
        n.vx *= 0.85; n.vy *= 0.85;
        n.x = Math.max(20, Math.min(W - 20, n.x));
        n.y = Math.max(20, Math.min(H - 20, n.y));
      }
    }
    setPositions({ nodes, edges, W, H });
  }, [data, height]);

  if (!positions) return <p className="loading">No network to display.</p>;

  const gangColor = (g) => {
    if (!g) return "#9bb0c9";
    const colors = ["#4f9cff", "#7b61ff", "#3ddc97", "#ffb347", "#ff5c6c", "#52d6e2", "#c084fc", "#f472b6"];
    const n = parseInt(String(g).replace(/\D/g, ""), 10) || 0;
    return colors[n % colors.length];
  };

  return (
    <div style={{ overflow: "auto" }}>
      <svg ref={ref} viewBox={`0 0 ${positions.W} ${positions.H}`} width="100%" height={height} style={{ background: "#0f1419", borderRadius: 10 }}>
        {positions.edges.map((e, i) => (
          <line key={i} x1={e.s.x} y1={e.s.y} x2={e.t.x} y2={e.t.y}
            stroke={e.relation === "co_offender" ? "#4f9cff55" : e.relation && e.relation.includes("account") ? "#3ddc9755" : "#9bb0c933"}
            strokeWidth={Math.min(3, (e.w || 1))} />
        ))}
        {positions.nodes.map((n) => {
          const isAcct = n.type === "account";
          const r = isAcct ? 6 : 5 + Math.min(10, (n.degree || 0));
          const fill = isAcct ? (n.flagged ? "#ff5c6c" : "#3ddc97") : gangColor(n.gang_id);
          return (
            <g key={n.id} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
              {isAcct ? (
                <rect x={n.x - r} y={n.y - r} width={r * 2} height={r * 2} fill={fill} opacity={0.85} rx={2} />
              ) : (
                <circle cx={n.x} cy={n.y} r={r} fill={fill} opacity={0.9} />
              )}
            </g>
          );
        })}
        {hover && (
          <g pointerEvents="none">
            <rect x={hover.x + 8} y={hover.y - 28} width={Math.max(90, (hover.label || "").length * 7 + 20)} height={38} fill="#1a2230" stroke="#2d3a4f" rx={4} />
            <text x={hover.x + 16} y={hover.y - 12} fill="#e7edf5" fontSize="11">{hover.label}</text>
            <text x={hover.x + 16} y={hover.y + 2} fill="#9bb0c9" fontSize="9">
              {hover.type === "account" ? (hover.flagged ? "flagged account" : "account") : `${hover.gang_id || "no gang"} · deg ${hover.degree || 0}`}
            </text>
          </g>
        )}
      </svg>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
        <span>● Offender (colour = gang, size = connections)</span>
        <span style={{ color: "#3ddc97" }}>▪ Account</span>
        <span style={{ color: "#ff5c6c" }}>▪ Flagged account</span>
      </div>
    </div>
  );
}
