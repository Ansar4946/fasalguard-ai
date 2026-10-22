/** Short tap feedback on devices that support it; silently does nothing elsewhere. */
export function haptic(ms = 10): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(ms);
  } catch {
    /* vibration is optional */
  }
}
