export interface OnboardingData {
  personal: { fullName:string; phone:string; email:string; language:string };
  farm: { experienceYears:string; province:string; district:string; crops:string[]; farmName:string; farmSizeAcres:string };
  field: { fieldName:string; fieldSizeAcres:string; cropType:string; approximateLocation:string };
  preferences: { anonymousContribution:boolean; nearbyAlerts:boolean; weatherAlerts:boolean; taskReminders:boolean };
  completed:boolean;
}
export type OnboardingSection=keyof Omit<OnboardingData,"completed">;
