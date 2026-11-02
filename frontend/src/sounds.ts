// Spec 0050 — a soft two-note chime when a question arrives (an invitation,
// a request to join). Nothing else makes a sound. The Sounds switch on the
// Account page turns it off, in this browser.

const KEY = "proxic.sounds";

export function soundsOn(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundsOn(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // Storage refused (a private window): the switch lasts this page only.
  }
}

let context: AudioContext | null = null;

/** E5 then B5, each fading over 0.6 s. Silent if the browser has no sound for us. */
export function playChime(): void {
  try {
    context ??= new AudioContext();
    const now = context.currentTime;
    for (const [frequency, at] of [
      [659.25, 0],
      [987.77, 0.14],
    ] as const) {
      const tone = context.createOscillator();
      const gain = context.createGain();
      tone.type = "sine";
      tone.frequency.value = frequency;
      gain.gain.setValueAtTime(0, now + at);
      gain.gain.linearRampToValueAtTime(0.18, now + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + at + 0.6);
      tone.connect(gain).connect(context.destination);
      tone.start(now + at);
      tone.stop(now + at + 0.65);
    }
  } catch {
    // No audio here (or not allowed yet): the card and the title still say it.
  }
}
