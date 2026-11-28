/*
 * Computes the caustic net's frames off the main thread (causticNet.ts), so
 * showing Above water never janks the app. Posts back every frame's buffer,
 * transferred rather than copied, and how long the work took.
 */
import { netFrames, type NetParams } from "./causticNet";

interface WorkerScope {
  onmessage: ((e: MessageEvent<NetParams>) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (e) => {
  const t0 = performance.now();
  const frames = netFrames(e.data);
  scope.postMessage(
    { frames, ms: performance.now() - t0 },
    frames.map((f) => f.buffer),
  );
};
