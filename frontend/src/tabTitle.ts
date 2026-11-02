// The browser tab's title, with a count of what is waiting: unread lobby
// chat (spec 0013) and questions (spec 0050). Each source sets its own
// count; the title shows the sum.

const BASE = "Proxic Arena";
const counts = new Map<string, number>();

export function setTitleCount(source: string, count: number): void {
  counts.set(source, count);
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
  document.title = total > 0 ? `(${total}) ${BASE}` : BASE;
}
