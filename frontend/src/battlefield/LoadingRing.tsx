// While a game starts: the five mana symbols circling the Proxic Arena
// logo, lighting one after another (owner pick 2026-10-21, "Mana ring").
// The line underneath says what the wait is, in a player's words --
// never the name of the engine behind it.

import type { CSSProperties } from "react";
import logo from "../assets/logo-header.webp";
import { symbolUrl } from "./ManaCost";

/** The colour pie, clockwise from the top, as on the back of a card. */
const PIE = ["W", "U", "B", "R", "G"] as const;

export function LoadingRing({ words }: { words: string }) {
  return (
    <div className="gs-loading" role="status">
      <div className="gs-ring" aria-hidden="true">
        <div className="gs-ring-orbit">
          {PIE.map((symbol, i) => (
            <span
              key={symbol}
              className="gs-ring-pip"
              style={
                {
                  "--gs-angle": `${i * 72}deg`,
                  "--gs-delay": `${i * 0.4}s`,
                } as CSSProperties
              }
            >
              <img src={symbolUrl(symbol)} alt="" draggable={false} />
            </span>
          ))}
        </div>
        <img className="gs-ring-logo" src={logo} alt="" draggable={false} />
      </div>
      <p className="gs-ring-words">{words}</p>
    </div>
  );
}
