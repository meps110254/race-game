/**
 * Deterministic flag and generator utility for racer teams.
 */
export function getTeamFlag(teamCode: string): string {
  if (!teamCode) return "";
  const cleaned = teamCode.trim().toUpperCase();
  if (!cleaned) return "";

  // Set of highly stylized flag icons (emoji & signs)
  const flags = [
    "🚩", "🏁", "🏴‍☠️", "⚡", "🔴", "🔵", "🟢", "🟡", "🟣", "🟠", "🔥", "🏆", "⚔️", "🏎️", "☣️", "⚜️", "💠", "🪐"
  ];
  
  let hash = 0;
  for (let i = 0; i < cleaned.length; i++) {
    hash = cleaned.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % flags.length;
  return flags[index];
}

/**
 * Format key code for friendly visual display labels.
 */
export function formatKeyLabel(code: string, key: string): string {
  if (!code) return key ? key.toUpperCase() : "None";
  if (code.startsWith("Key")) return code.replace("Key", "");
  if (code.startsWith("Digit")) return code.replace("Digit", "");
  if (code === "Space") return "Spacebar ⌴";
  if (code === "ShiftLeft") return "L-Shift ⇧";
  if (code === "ShiftRight") return "R-Shift ⇧";
  if (code === "ControlLeft") return "L-Ctrl ⌃";
  if (code === "ControlRight") return "R-Ctrl ⌃";
  if (code === "AltLeft") return "L-Alt ⌥";
  if (code === "AltRight") return "R-Alt ⌥";
  if (code === "ArrowUp") return "Up ⬆️";
  if (code === "ArrowDown") return "Down ⬇️";
  if (code === "ArrowLeft") return "Left ⬅️";
  if (code === "ArrowRight") return "Right ➡️";
  return key.toUpperCase() || code;
}
