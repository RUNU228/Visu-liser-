export interface Track {
  id: string;
  title: string;
  file: File;
  url: string;
  duration: number;
  status: "pending" | "ready" | "failed";
  error?: string;
}
export type Repeat = "off" | "queue" | "one";
export interface QueueSnapshot {
  rows: Track[];
  activeId: string | null;
  remaining: string[];
  visited: string[];
  history: string[];
  cursor: number;
  shuffle: boolean;
}
export class QueueModel {
  rows: Track[] = [];
  activeId: string | null = null;
  repeat: Repeat = "off";
  shuffle = false;
  remaining: string[] = [];
  visited = new Set<string>();
  history: string[] = [];
  cursor = -1;
  constructor(private random = Math.random) {}
  get active() {
    return this.rows.find((t) => t.id === this.activeId);
  }
  get playable() {
    return this.rows.filter((t) => t.status === "ready");
  }
  add(track: Track) {
    this.rows.push(track);
    if (track.status === "ready") this.available(track.id);
  }
  available(id: string) {
    if (this.shuffle && !this.visited.has(id) && !this.remaining.includes(id))
      this.remaining.splice(
        Math.floor(this.random() * (this.remaining.length + 1)),
        0,
        id,
      );
  }
  private shuffled(ids: string[]) {
    const a = [...ids];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  private visit(id: string) {
    this.visited.add(id);
    this.remaining = this.remaining.filter((x) => x !== id);
  }
  select(id: string) {
    if (!this.playable.some((t) => t.id === id)) return null;
    this.activeId = id;
    this.visit(id);
    this.history = this.history.slice(0, this.cursor + 1);
    if (this.history[this.cursor] !== id) {
      this.history.push(id);
      this.cursor = this.history.length - 1;
      if (this.history.length > 1000) {
        this.history.shift();
        this.cursor--;
      }
    }
    return id;
  }
  setShuffle(on: boolean) {
    this.shuffle = on;
    this.visited.clear();
    this.remaining = [];
    if (on) {
      if (this.active?.status === "ready") this.visit(this.activeId!);
      this.remaining = this.shuffled(
        this.playable.map((t) => t.id).filter((id) => id !== this.activeId),
      );
    }
  }
  next(automatic: boolean): string | null {
    if (automatic && this.repeat === "one" && this.active?.status === "ready")
      return this.activeId;
    if (!this.playable.length) return null;
    if (this.shuffle) {
      for (let i = this.cursor + 1; i < this.history.length; i++)
        if (this.playable.some((t) => t.id === this.history[i])) {
          this.cursor = i;
          this.activeId = this.history[i];
          this.visit(this.activeId);
          return this.activeId;
        }
      this.remaining = this.remaining.filter((id) =>
        this.playable.some((t) => t.id === id),
      );
      if (!this.remaining.length) {
        if (this.repeat !== "queue") return null;
        this.visited.clear();
        this.remaining = this.shuffled(this.playable.map((t) => t.id));
        if (this.remaining.length > 1 && this.remaining[0] === this.activeId)
          [this.remaining[0], this.remaining[1]] = [
            this.remaining[1],
            this.remaining[0],
          ];
      }
      return this.select(this.remaining[0]);
    }
    const index = this.rows.findIndex((t) => t.id === this.activeId);
    const next =
      this.rows.slice(index + 1).find((t) => t.status === "ready") ??
      (this.repeat === "queue" ? this.playable[0] : undefined);
    return next ? this.select(next.id) : null;
  }
  previous(position: number) {
    if (position > 3) return this.activeId;
    if (this.shuffle) {
      for (let i = this.cursor - 1; i >= 0; i--)
        if (this.playable.some((t) => t.id === this.history[i])) {
          this.cursor = i;
          this.activeId = this.history[i];
          this.visit(this.activeId);
          return this.activeId;
        }
      return this.activeId;
    }
    const index = this.rows.findIndex((t) => t.id === this.activeId);
    const previous = this.rows
      .slice(0, index)
      .reverse()
      .find((t) => t.status === "ready");
    return previous ? this.select(previous.id) : this.activeId;
  }
  private forget(id: string) {
    this.remaining = this.remaining.filter((x) => x !== id);
    this.visited.delete(id);
    const oldCursor = this.cursor;
    let removedBefore = 0;
    this.history = this.history.filter((x, i) => {
      if (x === id && i <= oldCursor) removedBefore++;
      return x !== id;
    });
    this.cursor = Math.min(this.history.length - 1, oldCursor - removedBefore);
  }
  fail(id: string) {
    const row = this.rows.find((t) => t.id === id);
    if (row) row.status = "failed";
    this.forget(id);
  }
  remove(id: string) {
    const index = this.rows.findIndex((t) => t.id === id);
    if (index < 0) return this.activeId;
    const active = id === this.activeId;
    const successor =
      this.rows.slice(index + 1).find((t) => t.status === "ready") ??
      this.rows
        .slice(0, index)
        .reverse()
        .find((t) => t.status === "ready");
    this.rows.splice(index, 1);
    this.forget(id);
    if (active) {
      this.activeId = null;
      if (successor) this.select(successor.id);
    }
    return this.activeId;
  }
  move(id: string, to: number) {
    const from = this.rows.findIndex((t) => t.id === id);
    if (from < 0) return;
    const [row] = this.rows.splice(from, 1);
    this.rows.splice(Math.min(this.rows.length, Math.max(0, to)), 0, row);
  }
  snapshot(): QueueSnapshot {
    return {
      rows: [...this.rows],
      activeId: this.activeId,
      remaining: [...this.remaining],
      visited: [...this.visited],
      history: [...this.history],
      cursor: this.cursor,
      shuffle: this.shuffle,
    };
  }
  restore(s: QueueSnapshot) {
    this.rows = [...s.rows];
    this.activeId = s.activeId;
    this.remaining = [...s.remaining];
    this.visited = new Set(s.visited);
    this.history = [...s.history];
    this.cursor = s.cursor;
    this.shuffle = s.shuffle;
  }
  clear() {
    this.rows = [];
    this.activeId = null;
    this.remaining = [];
    this.visited.clear();
    this.history = [];
    this.cursor = -1;
  }
}
