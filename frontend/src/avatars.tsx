// Avatars — spec 0006 (owner 2026-10-24).
//
// The owner's own set of 132 portraits (the second set, owner 2026-10-28), bundled with the app (they are not
// card art, so GIT-001 does not apply), and a default for anybody who has
// not chosen. A player's choice is saved with their account and reaches
// everybody in the Players list; this module only turns a name
// ("avatar-07") into a picture.

import defaultAvatar from "./assets/avatars/default.svg";
import type { PresenceKind, Rank } from "./lobbyView";

const files = import.meta.glob<string>("./assets/avatars/avatar-*.webp", {
  eager: true,
  import: "default",
});

const byName = new Map<string, string>();
for (const [path, url] of Object.entries(files)) {
  const name = /(avatar-\d+)\.webp$/.exec(path)?.[1];
  if (name) byName.set(name, url);
}

/** Every avatar a player may choose, in order: "avatar-01" … "avatar-132" (by number, not as text). */
export const AVATARS: string[] = [...byName.keys()].sort(
  (a, b) => Number(a.slice("avatar-".length)) - Number(b.slice("avatar-".length)),
);

/** The picture for [avatar], or the default when there is none (or it is unknown). */
export function avatarUrl(avatar: string | null | undefined): string {
  return (avatar && byName.get(avatar)) || defaultAvatar;
}

/** Spec 0011 — what each place's medal says, for a screen reader. */
export const RANK_WORDS: Record<Rank, string> = {
  1: "Reigning Proxic Champion",
  2: "2nd place",
  3: "3rd place",
  last: "Dead last",
};

/**
 * A round portrait. Decorative beside a name (the name says who it is);
 * give [label] only where the picture stands alone.
 *
 * Spec 0009 — with [status], a badge on its corner: a green dot online,
 * a yellow clock away, a grey cross offline. The shape changes with the
 * colour, and [statusLabel] says it in words ("away 7 minutes").
 *
 * Spec 0011 — with [rank], a gold, silver, bronze or muddy ring inside
 * the same square, and a medal on the other corner (1, 2, 3 or a pile).
 */
export function Avatar({
  avatar,
  size = 32,
  label,
  status,
  statusLabel,
  rank,
}: {
  avatar: string | null | undefined;
  size?: number;
  label?: string;
  status?: PresenceKind;
  statusLabel?: string;
  rank?: Rank | undefined;
}) {
  const picture = (
    <img
      className="pa-avatar"
      src={avatarUrl(avatar)}
      width={size}
      height={size}
      alt={label ?? ""}
      loading="lazy"
      decoding="async"
    />
  );
  if (!status && !rank) return picture;
  const badge = Math.max(12, Math.round(size * 0.36));
  const ring = rank ? Math.max(2, Math.round(size * 0.08)) : 0;
  return (
    <span
      className={`pa-avatar-wrap${status ? ` pa-avatar-${status}` : ""}${rank ? ` pa-rank pa-rank-${rank}` : ""}`}
      style={{ width: size, height: size, padding: ring || undefined }}
    >
      {picture}
      {rank && (
        <span
          className="pa-medal"
          role="img"
          aria-label={RANK_WORDS[rank]}
          title={RANK_WORDS[rank]}
          style={{ minWidth: badge + 2, height: badge + 2, fontSize: Math.round(badge * 0.72) }}
        >
          {rank === "last" ? "\u{1F4A9}" : rank}
        </span>
      )}
      {status && (
        <span
          className={`pa-presence pa-presence-${status}`}
          role="img"
          aria-label={statusLabel ?? status}
          title={statusLabel ?? status}
          style={{ width: badge, height: badge }}
        >
          {status !== "online" && (
            <svg aria-hidden="true" viewBox="0 0 10 10">
              {status === "away" ? <path d="M5 2.4V5l1.8 1.2" /> : <path d="M3 3l4 4M7 3 3 7" />}
            </svg>
          )}
        </span>
      )}
    </span>
  );
}
