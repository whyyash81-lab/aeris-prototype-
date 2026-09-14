import { Fragment, useEffect, useMemo, useRef } from "react";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import type { LiveNode, RiskState } from "@/lib/types";
import { HAZARD_META, STATE_META, CORE } from "@/lib/risk";
import { fmtNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";

const FALLBACK_CENTER: [number, number] = [18.55, 73.85];

/** Marker colour on the light map - near-black, grey offline, red critical. */
const markerColor = (risk: RiskState): string =>
  risk === "critical" ? "#ff3333" : risk === "offline" ? "#9ca3af" : "#111111";

function FitBounds({ nodes }: { nodes: LiveNode[] }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (!nodes.length || done.current) return;
    map.fitBounds(
      nodes.map((n) => [n.lat, n.lng] as LatLngExpression) as any,
      { padding: [60, 60] }
    );
    done.current = true;
  }, [nodes.length, map]);
  return null;
}

function Recentre({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => { map.setView(center, map.getZoom(), { animate: true }); }, [center[0], center[1], map]);
  return null;
}

/** Fly to a node when it is selected from the alert feed / trend selector. */
function FollowNode({ targetKey, nodes }: { targetKey: string | null; nodes: LiveNode[] }) {
  const map = useMap();
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!targetKey || last.current === targetKey) return;
    last.current = targetKey;
    const id = targetKey.slice(0, targetKey.lastIndexOf(":"));
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    map.flyTo([node.lat, node.lng], Math.max(map.getZoom(), 11), { duration: 0.9 });
  }, [targetKey, nodes, map]);
  return null;
}

export function MapView({
  nodes,
  selectedId,
  onSelect,
  focusKey,
  onOpenDetail,
  suppressed = false,
}: {
  nodes: LiveNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  focusKey?: string | null;
  onOpenDetail?: (id: string) => void;
  /** While the node-insights drawer is open: unmount any open popup and make
   *  the map non-interactive so the overlay is the only "active" surface. */
  suppressed?: boolean;
}) {
  const center = useMemo<[number, number]>(() => {
    if (!nodes.length) return FALLBACK_CENTER;
    const lat = nodes.reduce((s, n) => s + n.lat, 0) / nodes.length;
    const lng = nodes.reduce((s, n) => s + n.lng, 0) / nodes.length;
    return [lat, lng];
  }, [nodes]);

  return (
    // z-0 traps every leaflet pane (which use z-index up to ~1000 internally)
    // inside this wrapper's stacking context, so a stray popup can never
    // paint above the drawer overlay (z-40) even if one were left open.
    <div className={`relative z-0 h-full w-full ${suppressed ? "pointer-events-none" : ""}`}>
      <MapContainer center={center} zoom={10} className="map-pure h-full w-full" minZoom={4}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Recentre center={center} />
        <FitBounds nodes={nodes} />
        <FollowNode targetKey={focusKey ?? null} nodes={nodes} />
        {nodes.map((node) => {
          const risk = node.riskLevel;
          const col = markerColor(risk);
          const meta = STATE_META[risk];
          const active = selectedId === node.id;
          const isLive = risk !== "offline";
          const core = CORE[risk] + (active ? 2 : 0);

          return (
            <Fragment key={node.id}>
              <CircleMarker
                center={[node.lat, node.lng]}
                radius={core + 3}
                pathOptions={{
                  color: col,
                  fillColor: col,
                  fillOpacity: isLive ? 0.15 : 0.06,
                  weight: active ? 2 : 1,
                  opacity: isLive ? 0.7 : 0.3,
                }}
                eventHandlers={{ click: () => onSelect(node.id) }}
              />
              {isLive && risk === "critical" && (
                <CircleMarker
                  center={[node.lat, node.lng]}
                  radius={core + 5}
                  pathOptions={{
                    color: col,
                    fillColor: col,
                    fillOpacity: 0,
                    weight: 1,
                    className: "critical-only",
                  }}
                />
              )}
              <CircleMarker
                center={[node.lat, node.lng]}
                radius={core}
                pathOptions={{
                  color: active ? "#1793d1" : col,
                  fillColor: col,
                  fillOpacity: active ? 1 : 0.9,
                  weight: active ? 1.5 : 1,
                  stroke: true,
                  opacity: isLive ? 1 : 0.4,
                }}
                eventHandlers={{ click: () => onSelect(node.id) }}
              >
                {!suppressed && (
                  <Popup minWidth={200} maxWidth={240}>
                  <div className="w-[200px] text-[11px]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{node.name}</span>
                      <span className="font-mono text-[9px] uppercase tracking-wider" style={{ color: meta.hex }}>{meta.label}</span>
                    </div>
                    <div className="text-zinc-500 mb-2">
                      <span className="mr-1">{HAZARD_META[node.hazardType].emoji}</span>
                      {HAZARD_META[node.hazardType].label} · <span className="font-mono">{node.id}</span>
                    </div>
                    {node.latestAt != null && (
                      <div className="space-y-1 border-t border-white/5 pt-2">
                        {HAZARD_META[node.hazardType].metrics.map((m) => {
                          const v = node.metrics?.[m.key];
                          return (
                            <div key={m.key} className="flex justify-between">
                              <span className="text-zinc-500">{m.label}</span>
                              <span className="font-mono numeric">
                                {typeof v === "number" ? fmtNumber(v, m.decimals) : v === true ? "ON" : v === false ? "off" : "—"}
                                {typeof v === "number" && m.unit && <span className="ml-1 text-[9px] text-zinc-500">{m.unit}</span>}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/5 pt-2">
                      <div className="bg-white/3 px-2 py-1.5">
                        <div className="text-[9px] uppercase tracking-wider text-zinc-500">Risk</div>
                        <div className="font-mono numeric" style={{ color: meta.hex }}>{node.score != null ? Math.round(node.score) : "—"}/100</div>
                      </div>
                      <div className="bg-white/3 px-2 py-1.5">
                        <div className="text-[9px] uppercase tracking-wider text-zinc-500">Confidence</div>
                        <div className="font-mono numeric">{node.confidence != null ? Math.round(node.confidence * 100) : "—"}%</div>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => onOpenDetail?.(node.id)}>Open trend</Button>
                  </div>
                  </Popup>
                )}
              </CircleMarker>
            </Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}