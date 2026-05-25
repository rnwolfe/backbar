/**
 * Smart Shelf — fleet health. Per-node card with channel grid + MQTT stream.
 * Channels + counts flow live from the enhanced /nodes endpoint; RSSI is
 * still synthesized until the firmware reports it.
 */
import { useEffect, useState } from "react";
import { Cell, Pill, Stat } from "../console/Cells";
import { Dot, PageHead } from "../console/Chrome";
import { T, accent } from "../console/tokens";
import { Tooltip, TooltipRows } from "../console/Tooltip";
import { nodeAgo } from "../data/derive";
import { mqttRows } from "../data/synthetic";
import { useStore } from "../store/useStore";
import type { NodeWithChannels } from "../api/client";

interface Props {
  onCalibrate?(deviceId: string, channel: number): void;
}

export function Shelf({ onCalibrate }: Props) {
  const tweaks = useStore((s) => s.tweaks);
  const nodes = useStore((s) => s.nodes);
  const telemetry = useStore((s) => s.telemetry);
  const A = accent(tweaks.accent).primary;

  // tick at 1Hz so the MQTT stream's relative timestamps stay current
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const onlineCount = nodes.filter((n) => n.status === "online").length;
  const totalChannels = telemetry?.channels_total ?? nodes.reduce((s, n) => s + n.channels_total, 0);
  const totalOccupied = telemetry?.channels_occupied ?? nodes.reduce((s, n) => s + n.channels_occupied, 0);

  return (
    <div
      style={{
        padding: "14px 16px",
        overflow: "auto",
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <PageHead
        title="Smart Shelf · Fleet Health"
        meta={`${nodes.length} nodes · ${totalChannels} channels · ${totalOccupied} occupied · mqtt://homebox.lan:1883 · qos 1`}
        actions={
          <>
            <Pill>RESCAN</Pill>
            <Pill>PUSH CONFIG</Pill>
            <Pill>CAL ALL</Pill>
            <Pill color={A} active>
              + ENROL NODE
            </Pill>
          </>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          gap: 10,
          marginBottom: 14,
          padding: "0 16px",
        }}
      >
        <Stat
          label="ONLINE"
          value={`${onlineCount}/${nodes.length}`}
          delta="nodes"
          accent={onlineCount === nodes.length && nodes.length > 0 ? T.green : T.amber}
          density={tweaks.density}
        />
        <Stat
          label="CHANNELS"
          value={`${totalOccupied}/${totalChannels || 0}`}
          delta="occupied"
          density={tweaks.density}
        />
        <Stat
          label="READINGS · 1H"
          value={(telemetry?.readings_per_hour ?? 0).toLocaleString()}
          delta={telemetry ? `~ ${Math.round((telemetry.readings_per_hour / 3600) * 10) / 10}/sec` : "—"}
          accent={A}
          density={tweaks.density}
        />
        <Stat
          label="LAST POUR"
          value={telemetry?.last_pour_age_s != null ? formatAge(telemetry.last_pour_age_s) : "—"}
          delta={telemetry?.last_pour_at ? "ago" : "no pours"}
          density={tweaks.density}
        />
      </div>

      {nodes.length === 0 ? (
        <Cell padded style={{ margin: "0 16px 14px" }}>
          <div style={{ padding: "32px 8px", fontSize: 13, color: T.inkMuted, textAlign: "center" }}>
            No fleet nodes registered yet. P0 / P1 ships without hardware — wire MQTT in task-008 (P2a).
          </div>
        </Cell>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, padding: "0 16px", marginBottom: 14 }}>
          {nodes.map((n) => (
            <FleetNodeCard key={n.device_id} node={n} accent={A} onCalibrate={onCalibrate} />
          ))}
        </div>
      )}

      <div
        style={{
          margin: "0 16px 24px",
          background: T.surface,
          border: `1px solid ${T.hairline}`,
          padding: "12px 14px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.18em", color: T.inkMuted }}>MQTT STREAM · LIVE</div>
          <div style={{ display: "flex", gap: 14, fontFamily: T.mono, fontSize: 10, color: T.inkDim }}>
            <span>
              <span style={{ color: T.green }}>●</span> connected
            </span>
            <span>tls 1.3</span>
            <span>broker uptime {telemetry?.uptime_days != null ? `${telemetry.uptime_days}d` : "—"}</span>
          </div>
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 11, lineHeight: 1.75, color: T.inkDim }}>
          {mqttRows(tick).map((row, i) => (
            <div key={i} style={{ display: "flex", gap: 14 }}>
              <span style={{ color: T.inkMuted, width: 60 }}>{row.t}</span>
              <span
                style={{
                  color: row.tone === "ok" ? A : row.tone === "warn" ? T.amber : T.red,
                  width: 280,
                  whiteSpace: "nowrap",
                }}
              >
                {row.topic}
              </span>
              <span style={{ color: T.inkDim }}>
                {"{ "}
                {row.payload}
                {" }"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FleetNodeCard({
  node,
  accent: accentColor,
  onCalibrate,
}: {
  node: NodeWithChannels;
  accent: string;
  onCalibrate?(deviceId: string, channel: number): void;
}) {
  const isOff = node.status === "offline";
  // RSSI still synth — firmware reporting lands in a later task.
  const rssi = isOff ? "—" : `−${54 + ((node.device_id.length * 3) % 18)}`;
  const channels = node.channels_total;
  const occupied = node.channels_occupied;

  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${isOff ? T.red : T.hairline}`,
        padding: "14px 16px",
        position: "relative",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {isOff ? (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: T.red }} />
      ) : null}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, minWidth: 0 }}>
        <Dot status={node.status} glow={!isOff} />
        <div
          style={{
            fontFamily: T.mono,
            fontSize: 12,
            color: T.ink,
            fontWeight: 600,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            flex: 1,
            minWidth: 0,
          }}
        >
          {node.label ?? node.device_id}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 10, color: T.inkDim, flexShrink: 0 }}>
          fw {node.fw_version ?? "—"}
        </div>
      </div>
      <div
        style={{
          fontFamily: T.mono,
          fontSize: 10,
          color: T.inkDim,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {node.device_id}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 6,
          margin: "12px 0 10px",
          fontFamily: T.mono,
          fontSize: 11,
        }}
      >
        <div>
          <div style={{ color: T.inkDim, fontSize: 9, letterSpacing: "0.1em" }}>CHANNELS</div>
          <div style={{ color: T.ink, fontSize: 15, marginTop: 2 }}>
            {occupied}/{channels}
          </div>
        </div>
        <div>
          <div style={{ color: T.inkDim, fontSize: 9, letterSpacing: "0.1em" }}>LAST SEEN</div>
          <div style={{ color: isOff ? T.red : accentColor, fontSize: 15, marginTop: 2 }}>{nodeAgo(node.last_seen)}</div>
        </div>
        <div>
          <div style={{ color: T.inkDim, fontSize: 9, letterSpacing: "0.1em" }}>RSSI</div>
          <div style={{ color: T.ink, fontSize: 15, marginTop: 2 }}>{rssi}</div>
        </div>
      </div>
      {channels > 0 ? (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${channels}, 1fr)`,
              gap: 2,
              marginTop: "auto",
            }}
          >
            {node.channels.map((ch) => {
              const isOccupied = ch.bottle_id !== null;
              const uncal = isOccupied && !ch.calibrated;
              const rows = [
                { label: "channel", value: `${node.device_id} / CH${String(ch.channel).padStart(2, "0")}` },
                { label: "slot", value: ch.slot },
                { label: "bottle", value: ch.bottle_id ?? "— empty —" },
                { label: "cal", value: ch.calibrated ? "OK · 2-pt" : isOccupied ? "UNCALIBRATED" : "—" },
                { label: "action", value: "click to calibrate" },
              ];
              return (
                <Tooltip key={ch.channel} content={<TooltipRows rows={rows} />}>
                  <div
                    onClick={() => onCalibrate?.(node.device_id, ch.channel)}
                    style={{
                      aspectRatio: "1/2",
                      background: !isOccupied ? T.surface2 : uncal ? T.amber : accentColor,
                      opacity: !isOccupied ? 1 : uncal ? 0.85 : 0.75,
                      border: !isOccupied ? `1px dashed ${T.hairline2}` : "none",
                      cursor: onCalibrate ? "pointer" : "default",
                    }}
                  />
                </Tooltip>
              );
            })}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 8,
              fontFamily: T.mono,
              fontSize: 10,
              color: T.inkDim,
            }}
          >
            <span>ch01</span>
            <span>ch{String(channels).padStart(2, "0")}</span>
          </div>
        </>
      ) : (
        <div
          style={{
            marginTop: "auto",
            padding: "16px 0",
            fontSize: 11,
            color: T.inkMuted,
            textAlign: "center",
          }}
        >
          no channels registered
        </div>
      )}
    </div>
  );
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86_400)}d`;
}
