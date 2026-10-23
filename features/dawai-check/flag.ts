/** Dawai Check is hidden (nav item + page) unless NEXT_PUBLIC_DAWAI_CHECK_ENABLED is "true" or "1". */
export function isDawaiCheckEnabled(): boolean {
  const value = process.env.NEXT_PUBLIC_DAWAI_CHECK_ENABLED?.trim().toLowerCase();
  return value === "true" || value === "1";
}
