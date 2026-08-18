export interface OnboardingData {
  personal: { fullName:string; phone:string; email:string; language:string };
  farm: { experienceYears:string; province:string; district:string; crops:string[]; farmName:string; farmSizeAcres:string };
  // `boundaryPoints` is drawn once (as [lat, lng] pairs) on the map shown during the
  // "Add First Field" step, and is reused for BOTH the farm and its first field when
  // they're created after account registration — a field boundary identical to its
  // farm's boundary passes the backend's containment check (ST_CoveredBy), and it's a
  // reasonable "quick start" default. Users can draw a more precise field boundary
  // later from the Fields tab.
  field: { fieldName:string; fieldSizeAcres:string; cropType:string; boundaryPoints:[number, number][] };
  preferences: { anonymousContribution:boolean; nearbyAlerts:boolean; weatherAlerts:boolean; taskReminders:boolean };
  // Captured once, on first landing, from `?ref=`/`?src=` query params (see app/page.tsx and
  // app/join/page.tsx) and threaded through to registration so acquisition can be attributed.
  referral: { code:string; source:string };
  completed:boolean;
}
export type OnboardingSection=keyof Omit<OnboardingData,"completed">;
