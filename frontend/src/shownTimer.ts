// A page timer that rests while its tab is hidden -- PHASE_11 P11-E15.
//
// The clocks that only keep words on screen up to date ("Away 7 min", "last
// seen", the Status page's numbers, a spectator looking for the players'
// next game) did their work every few seconds whether anybody could see the
// page or not: a hidden lobby redrew itself every 15 s, a hidden Status page
// asked the server every 5 s. Now the timer stops when the tab is hidden and,
// when it is shown again, runs once at once and starts again: what is on
// screen is as fresh as before the moment anybody can see it.
//
// Not for a clock that decides something while nobody looks: going away
// after 5 minutes (activity.ts sets one timer for that moment while
// hidden), the lobby's liveness beat (lobby.ts, P11-E13) and a question's
// answer window (GameScreen), which keep running.

/** Calls [run] every [ms] while the tab is shown, and once on being shown again. Returns the stop. */
export function everyWhileShown(run: () => void, ms: number): () => void {
  let timer: number | null = null;
  const start = () => {
    if (timer === null) timer = window.setInterval(run, ms);
  };
  const stop = () => {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
  };
  const changed = () => {
    if (document.hidden) stop();
    else {
      run();
      start();
    }
  };
  if (!document.hidden) start();
  document.addEventListener("visibilitychange", changed);
  return () => {
    stop();
    document.removeEventListener("visibilitychange", changed);
  };
}
