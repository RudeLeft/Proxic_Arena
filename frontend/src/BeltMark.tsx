// Spec 0019 F1 — a mini Champion's Belt beside the holder's name, wherever
// names appear (the Players list, rooms, chat, the game). The holder is the
// server's (STANDINGS `belt`), the same the Hall of Champions shows.

import belt from "./assets/trophies/belt.webp";

export function BeltMark() {
  return (
    <img
      className="pa-belt-mark"
      src={belt}
      alt="Champion's Belt holder"
      title="Champion's Belt holder"
      width={36}
      height={14}
    />
  );
}
