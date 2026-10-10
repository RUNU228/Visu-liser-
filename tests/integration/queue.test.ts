import { describe, it, expect } from "vitest";
import { QueueModel, type Track } from "../../src/player/queue";
const track = (id: string, status: Track["status"] = "ready"): Track => ({
  id,
  title: id,
  file: {} as File,
  url: `blob:${id}`,
  duration: 10,
  status,
});
function queue() {
  const q = new QueueModel(() => 0.42);
  q.add(track("a"));
  q.add(track("b"));
  q.add(track("c"));
  q.select("a");
  return q;
}
describe("queue navigation", () => {
  it("repeat off advances normally then stops at end", () => {
    const q = queue();
    expect(q.next(true)).toBe("b");
    expect(q.next(true)).toBe("c");
    expect(q.next(true)).toBe(null);
    expect(q.activeId).toBe("c");
  });
  it("manual next bypasses repeat one", () => {
    const q = queue();
    q.repeat = "one";
    expect(q.next(true)).toBe("a");
    expect(q.next(false)).toBe("b");
  });
  it("shuffle visits every ID before exhaustion and replays history", () => {
    const q = queue();
    q.setShuffle(true);
    const second = q.next(false);
    const third = q.next(false);
    expect(new Set(["a", second, third]).size).toBe(3);
    expect(q.next(false)).toBe(null);
    expect(q.previous(1)).toBe(second);
    expect(q.next(false)).toBe(third);
  });
  it("selection truncates forward shuffle history without reintroducing visited IDs", () => {
    const q = queue();
    q.setShuffle(true);
    q.next(false);
    q.next(false);
    q.previous(1);
    q.select("a");
    expect(q.next(false)).toBe(null);
  });
  it("removing active uses visible successor even with shuffle", () => {
    const q = queue();
    q.select("b");
    q.setShuffle(true);
    expect(q.remove("b")).toBe("c");
    expect(q.activeId).toBe("c");
    q.remove("c");
    expect(q.activeId).toBe("a");
  });
  it("failed tracks are excluded even with repeat one", () => {
    const q = queue();
    q.repeat = "one";
    q.fail("a");
    expect(q.next(true)).toBe("b");
    q.fail("b");
    q.fail("c");
    expect(q.next(true)).toBe(null);
  });
  it("new repeat shuffle cycle does not start with just-completed track", () => {
    const q = queue();
    q.setShuffle(true);
    q.repeat = "queue";
    q.next(true);
    q.next(true);
    const last = q.activeId;
    expect(q.next(true)).not.toBe(last);
  });
  it("snapshot restores navigation paused by the caller and keeps reorder stable", () => {
    const q = queue();
    q.setShuffle(true);
    q.next(false);
    const before = q.snapshot();
    q.clear();
    q.restore(before);
    expect(q.activeId).toBe(before.activeId);
    expect(q.history).toEqual(before.history);
    const remainder = [...q.remaining];
    q.move("a", 2);
    expect(q.remaining).toEqual(remainder);
  });
});
