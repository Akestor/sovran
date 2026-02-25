const CUSTOM_EPOCH = 1704067200000n; // 2024-01-01T00:00:00Z
const NODE_ID_BITS = 10n;
const SEQUENCE_BITS = 12n;
const MAX_NODE_ID = (1n << NODE_ID_BITS) - 1n;
const MAX_SEQUENCE = (1n << SEQUENCE_BITS) - 1n;

const TIMESTAMP_SHIFT = NODE_ID_BITS + SEQUENCE_BITS; // 22n
const NODE_ID_SHIFT = SEQUENCE_BITS; // 12n

export class SnowflakeGenerator {
  private readonly nodeId: bigint;
  private sequence = 0n;
  private lastTimestamp = -1n;

  constructor(nodeId: number) {
    const id = BigInt(nodeId);
    if (id < 0n || id > MAX_NODE_ID) {
      throw new Error(`nodeId must be between 0 and ${MAX_NODE_ID}`);
    }
    this.nodeId = id;
  }

  generate(): string {
    let timestamp = BigInt(Date.now()) - CUSTOM_EPOCH;

    if (timestamp < this.lastTimestamp) {
      throw new Error(
        `Clock moved backwards. Refusing to generate ID for ${this.lastTimestamp - timestamp}ms`,
      );
    }

    if (timestamp === this.lastTimestamp) {
      this.sequence = (this.sequence + 1n) & MAX_SEQUENCE;
      if (this.sequence === 0n) {
        while (timestamp <= this.lastTimestamp) {
          timestamp = BigInt(Date.now()) - CUSTOM_EPOCH;
        }
      }
    } else {
      this.sequence = 0n;
    }

    this.lastTimestamp = timestamp;

    const id =
      (timestamp << TIMESTAMP_SHIFT) | (this.nodeId << NODE_ID_SHIFT) | this.sequence;

    return id.toString();
  }

  static parse(id: string): { timestamp: Date; nodeId: number; sequence: number } {
    const value = BigInt(id);
    const timestamp = (value >> TIMESTAMP_SHIFT) + CUSTOM_EPOCH;
    const nodeId = (value >> NODE_ID_SHIFT) & MAX_NODE_ID;
    const sequence = value & MAX_SEQUENCE;

    return {
      timestamp: new Date(Number(timestamp)),
      nodeId: Number(nodeId),
      sequence: Number(sequence),
    };
  }
}
