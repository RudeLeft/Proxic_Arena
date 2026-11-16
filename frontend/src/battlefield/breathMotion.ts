// Spec 0090 (items 2 and 3) -- cheaper "you can pick this" glow, calmer flyers.
//
// The glow (Amendment 13, item 5) used to animate the card's own box-shadow,
// so every marked card was repainted on every frame. Now the card keeps the
// still drop shadow, and a soft layer (`.bf-breath`, game.css) drawn right
// after it, over that shadow as the glow was, carries the glow; only the
// opacity of the glow's two halves animates, which the browser composites
// without repainting.
// The card's own movements (a flip, a fighter's lunge, a shake) are played on
// the layer too, so the glow goes where the card goes, as it did when it was
// the card's shadow.
//
// Flyers (owner 2026-11-01, item 3) bob on their own; above FLY_SYNC_AT on
// the table they bob in step on one clock (the page's timeline), and while
// the tab is hidden they do not bob at all.

/** Spec 0090 (3) -- more flyers than this on the table bob in step. */
export const FLY_SYNC_AT = 12;

/** The CSS animations that make a flyer hover: the card's, its shadow's, its glow's. */
export const FLY_ANIMATIONS: ReadonlySet<string> = new Set([
  "bf-fly",
  "bf-fly-bob",
  "bf-fly-shadow",
]);

/** Spec 0092 -- more sick creatures than this on the table drift their z's in step. */
export const ZZ_SYNC_AT = 12;

/** Spec 0092 -- a summoning-sick creature's drifting z's. */
export const ZZ_ANIMATIONS: ReadonlySet<string> = new Set(["bf-zz"]);

/** Spec 0092 -- one loop of the z's (battlefield.css `bf-zz`), and a third of it. */
export const ZZ_LOOP_MS = 2800;
export const ZZ_GAP_MS = 933;

/** What a card's movement may change that its glow must follow. */
const FOLLOWED = ["transform", "translate", "rotate", "scale", "opacity", "filter"];

type Css = Animation & { animationName?: string; transitionProperty?: string };
const isCss = (a: Animation) =>
  typeof (a as Css).animationName === "string" || typeof (a as Css).transitionProperty === "string";

const mirrors = new WeakMap<Animation, Animation>();

/**
 * Plays each glow layer's card's own movements (its Web Animations: a flip,
 * a lunge, a shake) on the layer too, from the same moment, so the glow
 * moves with its card. A click hurries both alike (motion.ts `hurry`). CSS
 * animations are left to CSS (a flyer's glow wears the flyer's own classes).
 */
export function followCards(root: ParentNode | null) {
  if (!root) return;
  for (const breath of root.querySelectorAll<HTMLElement>(".bf-breath")) {
    const host = breath.previousElementSibling as HTMLElement | null;
    if (!host || typeof host.getAnimations !== "function" || typeof breath.animate !== "function")
      continue;
    for (const animation of host.getAnimations()) {
      if (mirrors.has(animation) || isCss(animation) || animation.playState === "finished")
        continue;
      const effect = animation.effect as KeyframeEffect | null;
      if (!effect || typeof effect.getKeyframes !== "function") continue;
      const frames = effect.getKeyframes().map((frame) => {
        const kept: Keyframe = {};
        if (frame.offset !== null && frame.offset !== undefined) kept.offset = frame.offset;
        if (frame.easing) kept.easing = frame.easing;
        if (frame.composite && frame.composite !== "auto") kept.composite = frame.composite;
        for (const key of FOLLOWED) if (frame[key] !== undefined) kept[key] = frame[key];
        return kept;
      });
      if (!frames.some((frame) => FOLLOWED.some((key) => frame[key] !== undefined))) continue;
      const mirror = breath.animate(frames, effect.getTiming());
      if (animation.startTime !== null) mirror.startTime = animation.startTime;
      else if (animation.currentTime !== null) mirror.currentTime = animation.currentTime;
      if (animation.playbackRate !== 1) mirror.updatePlaybackRate(animation.playbackRate);
      if (animation.playState === "paused") mirror.pause();
      animation.addEventListener("cancel", () => mirror.cancel());
      mirrors.set(animation, mirror);
    }
  }
}

// --- spec 0095: only the cards that started moving -----------------------------------------------

/** Cards with a glow layer that have started a Web Animation since the last look. */
const started = new Set<Element>();
/** Glow layers already looked at: a new one has its card's running movements copied once. */
const layersSeen = new WeakSet<Element>();
let watched: typeof Element.prototype.animate | null = null;

/**
 * Notes every `animate()` on a card that has a glow layer (its next sibling),
 * so the Board looks only at those. True while it is the page's animate; false
 * when something replaced it since (a test's stand-in): then nobody knows what
 * started, and the Board looks at every card once, as before 0095.
 */
function watchAnimate(): boolean {
  if (typeof Element === "undefined" || typeof Element.prototype.animate !== "function")
    return false;
  if (Element.prototype.animate === watched) return true;
  // Called below with the element as `this` (apply), as the page calls it.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const own = Element.prototype.animate;
  const noting = function (this: Element, ...args: Parameters<Element["animate"]>) {
    if (this.nextElementSibling?.classList.contains("bf-breath")) started.add(this);
    return own.apply(this, args);
  };
  Element.prototype.animate = noting;
  watched = noting;
  return false;
}
watchAnimate();

/**
 * Spec 0095 -- followCards for what changed only: the cards that started a
 * Web Animation since the last call, and the cards whose glow layer is new.
 * No card is asked for its animations (which makes the browser work out
 * every style) when nothing started.
 */
export function followStarted(root: ParentNode | null) {
  if (!root) return;
  if (!watchAnimate()) {
    started.clear();
    for (const breath of root.querySelectorAll(".bf-breath")) layersSeen.add(breath);
    followCards(root);
    return;
  }
  const hosts = new Set<Element>();
  for (const host of started) if (host.isConnected) hosts.add(host);
  started.clear();
  for (const breath of root.querySelectorAll(".bf-breath")) {
    if (layersSeen.has(breath)) continue;
    layersSeen.add(breath);
    const host = breath.previousElementSibling;
    if (host) hosts.add(host);
  }
  if (hosts.size === 0) return;
  followCards({
    querySelectorAll: () =>
      [...hosts]
        .map((host) => host.nextElementSibling)
        .filter((el): el is HTMLElement => !!el && el.classList.contains("bf-breath")),
  } as unknown as ParentNode);
}

/** Every hovering flyer's CSS animation under the board (or those named). */
export function flyAnimations(
  root: Element | null,
  names: ReadonlySet<string> = FLY_ANIMATIONS,
): Animation[] {
  if (!root || typeof root.getAnimations !== "function") return [];
  return root
    .getAnimations({ subtree: true })
    .filter((a) => names.has((a as Css).animationName ?? ""));
}

/**
 * Spec 0090 (3) -- in step: every flyer's hover runs on the page's own
 * timeline from its zero, so all of them are at the same point of their bob.
 * Spec 0092 -- the z's too, with ZZ_ANIMATIONS: each letter keeps its own
 * third of the loop (its delay), so they stay apart.
 */
export function bobInStep(root: Element | null, names: ReadonlySet<string> = FLY_ANIMATIONS) {
  for (const a of flyAnimations(root, names)) if (a.startTime !== 0) a.startTime = 0;
}

const STILL_WHEN_HIDDEN: ReadonlySet<string> = new Set([...FLY_ANIMATIONS, ...ZZ_ANIMATIONS]);

/**
 * Spec 0090 (3) -- the tab hidden: no flyer bobs; shown again: they go on.
 * Spec 0092 -- nor do the z's drift.
 */
export function pauseFlyers(root: Element | null, hidden: boolean) {
  for (const a of flyAnimations(root, STILL_WHEN_HIDDEN)) {
    if (hidden && a.playState === "running") a.pause();
    else if (!hidden && a.playState === "paused") a.play();
  }
}
