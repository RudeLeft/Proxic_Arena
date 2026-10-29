// Spec 0019 F1 — a mini Champion's Belt beside the holder's name, wherever
// names appear (the Players list, rooms, chat, the game). The holder is the
// server's (STANDINGS `belt`), the same the Hall of Champions shows.

// Spec 0031 — the owner's own belt drawing, its line thickened and its
// plates filled so it reads at this size (the Hall keeps the big belt).
import belt from "./assets/trophies/belt-mark.webp";

export function BeltMark() {
  return (
    <img
      className="pa-belt-mark"
      src={belt}
      alt="Champion's Belt holder"
      title="Champion's Belt holder"
      width={40}
      height={13}
    />
  );
}
