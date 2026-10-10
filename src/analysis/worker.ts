import { AnalysisWorkerHost } from "./engine";
import type { WorkerInput, WorkerOutput } from "../shared/types";
const scope = self as unknown as {
  postMessage: (output: WorkerOutput, transfer?: Transferable[]) => void;
  onmessage: ((event: MessageEvent<WorkerInput>) => void) | null;
};
const host = new AnalysisWorkerHost((output, transfer) =>
  scope.postMessage(output, transfer ?? []),
);
scope.onmessage = (event) => host.handle(event.data);
