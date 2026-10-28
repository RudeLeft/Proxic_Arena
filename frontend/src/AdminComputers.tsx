// The Admin page's Computers tab — spec 0027 (owner 2026-10-28).
//
// Every computer linked to the Deck Builder, for every player: whose, its
// name, when it was linked, when and where it was last used. Remove asks
// first, in the row (no popups, owner 2026-10-24), and ends the link as the
// player's own Remove on the Account page does.

import { useState } from "react";
import { lastUsedText, removeComputer, type AdminComputer, type AdminOutcome } from "./admin";
import { Avatar } from "./avatars";
import { shortDate } from "./devices";
import { ICON, presenceOf } from "./lobbyView";
import { useLobbyConnection } from "./shell/LobbyConnection";

type Run = (
  what: () => Promise<AdminOutcome>,
  done: (detail: string) => string,
) => Promise<boolean>;

export function ComputersPanel({
  computers,
  only,
  showAll,
  now,
  run,
}: {
  computers: AdminComputer[];
  /** One player's computers, from their Manage menu; null for everyone's. */
  only: string | null;
  showAll: () => void;
  now: number;
  run: Run;
}) {
  const { lobby } = useLobbyConnection();
  const [confirming, setConfirming] = useState<string | null>(null);
  const shown = only ? computers.filter((c) => c.userId === only) : computers;
  const whose = only ? (computers.find((c) => c.userId === only)?.displayName ?? null) : null;

  return (
    <section className="pa-admin-panel" aria-labelledby="computers-heading">
      <div className="pa-admin-panel-head">
        <h2 id="computers-heading">Linked computers</h2>
        <span className="pa-admin-panel-note">
          {whose
            ? `${whose}'s computers`
            : "Computers linked to the Deck Builder, for every player"}
        </span>
        {only && (
          <button type="button" className="pa-small-button" onClick={showAll}>
            Show every player
          </button>
        )}
      </div>
      {shown.length === 0 && (
        <p className="pa-group-empty">
          {only ? "No computers are linked to this account." : "No computers are linked yet."}
        </p>
      )}
      {shown.length > 0 && (
        <ul className="pa-admin-computers">
          <li className="pa-admin-list-head pa-admin-computer-line" aria-hidden="true">
            <span>Player</span>
            <span>Computer</span>
            <span>Linked</span>
            <span>Last used</span>
            <span>Actions</span>
          </li>
          {shown.map((computer) => {
            const used = lastUsedText(computer.lastUsedAt, now, (iso) => shortDate(iso));
            const avatar = lobby.players.find((p) => p.userId === computer.userId)?.avatar ?? null;
            const asking = confirming === computer.deviceId;
            return (
              <li key={computer.deviceId} className="pa-admin-computer">
                <div className="pa-admin-computer-line">
                  <span className="pa-admin-account-who">
                    <Avatar
                      avatar={avatar}
                      size={ICON}
                      {...presenceOf(lobby, computer.userId, computer.displayName, now)}
                    />
                    <span className="pa-admin-account-name">{computer.displayName}</span>
                  </span>
                  <span className="pa-admin-computer-name">{computer.name}</span>
                  <span className="pa-admin-account-meta pa-admin-computer-linked">
                    <span className="pa-admin-computer-label">Linked: </span>
                    {shortDate(computer.linkedAt)}
                  </span>
                  <span
                    className={`pa-admin-account-meta pa-admin-computer-used${used.stale ? " pa-admin-computer-stale" : ""}`}
                  >
                    {computer.lastUsedAt && (
                      <span className="pa-admin-computer-label">Last used: </span>
                    )}
                    {used.text}
                    {computer.lastUsedFrom && (
                      <span className="pa-admin-computer-from">from {computer.lastUsedFrom}</span>
                    )}
                  </span>
                  <span>
                    <button
                      type="button"
                      className="pa-small-button"
                      aria-label={`Remove ${computer.name} from ${computer.displayName}`}
                      aria-expanded={asking}
                      onClick={() => setConfirming(asking ? null : computer.deviceId)}
                    >
                      Remove
                    </button>
                  </span>
                </div>
                {asking && (
                  <div
                    className="pa-admin-computer-confirm"
                    role="group"
                    aria-label="Remove computer"
                  >
                    <p>
                      <strong>Remove {computer.name}?</strong> The Deck Builder on that computer
                      stops sending decks to {computer.displayName}&apos;s Deck Depot until{" "}
                      {computer.displayName} links it again. Their decks already on Arena stay.
                    </p>
                    <button
                      type="button"
                      className="pa-button pa-button-warn"
                      onClick={() => {
                        setConfirming(null);
                        void run(
                          () => removeComputer(computer.deviceId),
                          () => `${computer.name} is no longer linked to ${computer.displayName}.`,
                        );
                      }}
                    >
                      Remove computer
                    </button>
                    <button
                      type="button"
                      className="pa-button pa-button-quiet"
                      onClick={() => setConfirming(null)}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
