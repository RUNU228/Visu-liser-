import type { TransportState } from "../audio/engine";

export const stateNames: Record<TransportState, string> = {
  empty: "No track",
  ready: "Ready to play",
  playing: "Playing",
  paused: "Paused",
  buffering: "Buffering",
  interrupted: "Audio interrupted",
  ended: "Ended",
  error: "File error",
};

export const repeatNames = { off: "off", queue: "queue", one: "one track" };
