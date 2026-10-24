// Avatars — spec 0006 (owner 2026-10-24).
//
// The owner's own set of 50 portraits, bundled with the app (they are not
// card art, so GIT-001 does not apply), and a default for anybody who has
// not chosen. A player's choice is saved with their account and reaches
// everybody in the Players list; this module only turns a name
// ("avatar-07") into a picture.

import defaultAvatar from "./assets/avatars/default.svg";

const files = import.meta.glob<string>("./assets/avatars/avatar-*.webp", {
  eager: true,
  import: "default",
});

const byName = new Map<string, string>();
for (const [path, url] of Object.entries(files)) {
  const name = /(avatar-\d\d)\.webp$/.exec(path)?.[1];
  if (name) byName.set(name, url);
}

/** Every avatar a player may choose, in order: "avatar-01" … "avatar-50". */
export const AVATARS: string[] = [...byName.keys()].sort();

/** The picture for [avatar], or the default when there is none (or it is unknown). */
export function avatarUrl(avatar: string | null | undefined): string {
  return (avatar && byName.get(avatar)) || defaultAvatar;
}

/**
 * A round portrait. Decorative beside a name (the name says who it is);
 * give [label] only where the picture stands alone.
 */
export function Avatar({
  avatar,
  size = 32,
  label,
}: {
  avatar: string | null | undefined;
  size?: number;
  label?: string;
}) {
  return (
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
}
