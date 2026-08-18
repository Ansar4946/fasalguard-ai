export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

export interface PasswordSetupEmail {
  recipient: string;
  setupUrl: string;
  expiresInMinutes: number;
}

export interface CredentialsEmail {
  recipient: string;
  password: string;
}

export interface WeatherAlertEmail {
  recipient: string;
  fieldName: string;
  condition: string;
  suitability: string;
  guidance: string;
}

export interface OnboardingReminderEmail {
  recipient: string;
  fullName: string;
}

export interface RoadmapReadyEmail {
  recipient: string;
  farmName: string;
}

export interface InsightReadyEmail {
  recipient: string;
  context: string;
  diagnosis: string;
}

export interface WeeklySummaryEmail {
  recipient: string;
  pendingTasks: number;
  completedTasks: number;
}

export interface EmailProvider {
  sendPasswordSetup(message: PasswordSetupEmail): Promise<void>;
  sendCredentials(message: CredentialsEmail): Promise<void>;
  sendWeatherAlert(message: WeatherAlertEmail): Promise<void>;
  sendOnboardingReminder(message: OnboardingReminderEmail): Promise<void>;
  sendRoadmapReady(message: RoadmapReadyEmail): Promise<void>;
  sendInsightReady(message: InsightReadyEmail): Promise<void>;
  sendWeeklySummary(message: WeeklySummaryEmail): Promise<void>;
}
