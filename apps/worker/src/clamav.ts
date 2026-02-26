/**
 * Minimal clamd INSTREAM client for virus scanning.
 * Streams bytes to clamd without local file persistence.
 * Protocol: https://man.archlinux.org/man/clamd.8.en#INSTREAM
 */

import { connect } from 'net';

const INSTREAM_CHUNK_MAX = 2048;

export type ScanResult = { ok: true } | { ok: false; virus?: string };

export async function scanStream(
  host: string,
  port: number,
  stream: AsyncIterable<Uint8Array>,
): Promise<ScanResult> {
  return new Promise((resolve, reject) => {
    const socket = connect(
      { host, port },
      () => {
        socket.write('zINSTREAM\0', (err) => {
          if (err) {
            socket.destroy();
            reject(err);
            return;
          }
          pump();
        });
      },
    );

    let buffer = Buffer.alloc(0);

    async function pump() {
      try {
        for await (const chunk of stream) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          let offset = 0;
          while (offset < buf.length) {
            const size = Math.min(INSTREAM_CHUNK_MAX, buf.length - offset);
            const lenBuf = Buffer.alloc(4);
            lenBuf.writeUInt32BE(size, 0);
            socket.write(lenBuf);
            socket.write(buf.subarray(offset, offset + size));
            offset += size;
          }
        }
        const endBuf = Buffer.alloc(4);
        endBuf.writeUInt32BE(0, 0);
        socket.write(endBuf);
        socket.end();
      } catch (err) {
        socket.destroy();
        reject(err);
      }
    }

    socket.on('data', (data: Buffer) => {
      buffer = Buffer.concat([buffer, data]);
    });

    socket.on('end', () => {
      const response = buffer.toString('utf8').replace(/\0/g, '').trim();
      if (response.includes('FOUND')) {
        const match = response.match(/stream: (.+?) FOUND/);
        resolve({ ok: false, virus: match?.[1] ?? 'unknown' });
      } else if (response.includes('stream: OK')) {
        resolve({ ok: true });
      } else {
        resolve({ ok: false, virus: response || 'scan error' });
      }
    });

    socket.on('error', reject);
  });
}
