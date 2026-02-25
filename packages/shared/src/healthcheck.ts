import { writeFile } from 'node:fs/promises';

const DEFAULT_PATH = '/tmp/.worker-healthy';

export async function touchHealthFile(path: string = DEFAULT_PATH): Promise<void> {
  await writeFile(path, new Date().toISOString(), 'utf-8');
}

export function startHealthBeat(
  intervalMs: number = 5000,
  path: string = DEFAULT_PATH,
): { stop: () => void } {
  const tick = () => {
    touchHealthFile(path).catch(() => {
      /* best-effort */
    });
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  return {
    stop: () => clearInterval(timer),
  };
}
