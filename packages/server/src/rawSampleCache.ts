/**
 * Latest-raw-sample cache, keyed by (device_id, channel).
 *
 * The MQTT subscriber writes every incoming reading here, even when the
 * channel isn't bound to a bottle yet — that lets the calibration UI poll
 * `/nodes/:device_id/channels/:channel/sample` during the 2-point capture,
 * which is exactly the case where the channel has no bottle assigned.
 *
 * Pure in-memory; a server restart wipes it. That's fine — the cal flow is
 * an interactive operator action, not a persisted resource. The `reading`
 * table is still the source of truth for mapped channels.
 */
export interface RawSample {
  device_id: string;
  channel: number;
  /** Whatever the node published in the `raw_g` field. Under the spec the
   *  node has already applied its current cal_slope/cal_offset, so when the
   *  channel is in identity-cal mode (slope=1, offset=0) this is the
   *  literal HX711 raw count. */
  raw_g: number;
  ts: number;
}

const key = (device_id: string, channel: number) => `${device_id}/${channel}`;

export class RawSampleCache {
  private map = new Map<string, RawSample>();

  set(sample: RawSample): void {
    this.map.set(key(sample.device_id, sample.channel), sample);
  }

  get(device_id: string, channel: number): RawSample | null {
    return this.map.get(key(device_id, channel)) ?? null;
  }

  /** All samples for a device (any channel). Used for "show me what this node is reporting." */
  forDevice(device_id: string): RawSample[] {
    const out: RawSample[] = [];
    for (const v of this.map.values()) if (v.device_id === device_id) out.push(v);
    return out.sort((a, b) => a.channel - b.channel);
  }

  /** Number of (device, channel) pairs cached. Useful in tests. */
  size(): number {
    return this.map.size;
  }
}
