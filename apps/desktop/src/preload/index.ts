/**
 * Preload script for Traffic Guru
 * Exposes a single, narrow, typed API
 */

import { contextBridge, ipcRenderer } from "electron";
import type {
  IpcChannel,
  IpcRequest,
  IpcResponse,
  TrafficEvent,
} from "@flowpilot/ipc-contracts";
import type { ProblemDetail } from "@flowpilot/errors";

export type InvokeResult<C extends IpcChannel> =
  | { ok: true; data: IpcResponse<C> }
  | { ok: false; error: ProblemDetail };

const api = {
  invoke<C extends IpcChannel>(
    channel: C,
    request: IpcRequest<C>
  ): Promise<InvokeResult<C>> {
    return ipcRenderer.invoke(channel, request);
  },
  onTrafficEvent(callback: (event: TrafficEvent) => void): () => void {
    const listener = (_e: unknown, payload: unknown) => {
      callback(payload as TrafficEvent);
    };
    ipcRenderer.on("traffic:events", listener);
    return () => ipcRenderer.removeListener("traffic:events", listener);
  },
};

contextBridge.exposeInMainWorld("trafficguru", api);

export type TrafficGuruApi = typeof api;
