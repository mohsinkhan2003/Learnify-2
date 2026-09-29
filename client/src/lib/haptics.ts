/** A short tap of vibration for key actions (Android; iPhone and desktops simply ignore it). */
export function haptic(ms = 8): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not allowed in this context */
  }
}
