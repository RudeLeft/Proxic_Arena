// CI run 46102439643 (match-catchup "after the replay"): a page that came
// back holding the newest board is sent no board on its new connection
// (spec 0119, Resume.Newest), so the newest connection alone can have none
// while the page draws, correctly, the board the connection before it sent.
// The browser specs compare with the newest board over all the page's
// connections (e2e/slow-link.ts `newestSent`).
import { describe, expect, it } from "vitest";
import { newestSent } from "../e2e/slow-link";

const board = (rev: number) => ({ gameEpoch: 1, stateRevision: rev });

describe("newestSent", () => {
  it("is the newest connection's last board when it has one", () => {
    expect(newestSent([{ whole: { last: board(38) } }, { whole: { last: board(41) } }])).toEqual(
      board(41),
    );
  });

  it("is the last board of the connection before, when the newest came back and was sent none", () => {
    expect(newestSent([{ whole: { last: board(39) } }, { whole: { last: null } }])).toEqual(
      board(39),
    );
  });

  it("is null before any board", () => {
    expect(newestSent([])).toBeNull();
    expect(newestSent([{ whole: { last: null } }])).toBeNull();
  });
});
