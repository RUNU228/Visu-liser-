export interface CaptureState {
  intent: boolean;
  playing: boolean;
  seeking: boolean;
  context: string;
  visible: boolean;
  frozen: boolean;
  enabled: boolean;
  primary: boolean;
}
export function captureEligible(s: CaptureState) {
  return (
    s.intent &&
    s.playing &&
    !s.seeking &&
    s.context === "running" &&
    s.visible &&
    !s.frozen &&
    s.enabled &&
    s.primary
  );
}
export function matchesBoundary(
  value: { sessionId: number; captureEpoch: number },
  sessionId: number,
  captureEpoch: number,
) {
  return value.sessionId === sessionId && value.captureEpoch === captureEpoch;
}
