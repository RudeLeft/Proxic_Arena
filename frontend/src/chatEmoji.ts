// The chat's emoji — spec 0007 (owner 2026-10-24).
//
// Two short lists, chosen rather than a library: nothing to download,
// and the reactions are the server's list too (LobbySocketHandler's
// REACTIONS), which refuses anything else.

/** The six reactions, in the order the row shows them. */
export const REACTIONS: readonly string[] = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

/** The emoji panel by Send: 40, five rows of eight. The owner may swap any. */
// prettier-ignore
export const PICKER: readonly string[] = [
  "😀", "😂", "🤣", "😊", "😍", "😎", "🤔", "😅",
  "😬", "😮", "😢", "😭", "😡", "🤯", "🥳", "😴",
  "🙃", "🤝", "👍", "👎", "👏", "🙏", "💪", "👀",
  "🔥", "⚔️", "🛡️", "💀", "🐉", "🧙", "✨", "💎",
  "🎲", "🃏", "🏆", "❤️", "💔", "☠️", "🍀", "🎉",
];
