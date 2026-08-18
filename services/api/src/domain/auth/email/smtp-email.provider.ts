import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type {
  CredentialsEmail,
  EmailProvider,
  InsightReadyEmail,
  OnboardingReminderEmail,
  PasswordSetupEmail,
  RoadmapReadyEmail,
  WeatherAlertEmail,
  WeeklySummaryEmail,
} from './email-provider';
type Transporter = ReturnType<typeof nodemailer.createTransport>;

@Injectable()
export class SmtpEmailProvider implements EmailProvider {
  constructor(private readonly config: ConfigService) {}

  async sendPasswordSetup(message: PasswordSetupEmail): Promise<void> {
    const { transporter, from } = this.transport();
    await transporter.sendMail({
      from,
      to: message.recipient,
      subject: 'Set your FasalGuard AI password',
      text: `Your FasalGuard AI account is ready. Set your password within ${message.expiresInMinutes} minutes: ${message.setupUrl}\n\nIf you did not request this account, ignore this email.`,
      html: `<p>Your FasalGuard AI account is ready.</p><p><a href="${message.setupUrl}">Set your password</a> within ${message.expiresInMinutes} minutes.</p><p>If you did not request this account, ignore this email.</p>`,
    });
  }

  async sendCredentials(message: CredentialsEmail): Promise<void> {
    const { transporter, from } = this.transport();
    await transporter.sendMail({
      from,
      to: message.recipient,
      subject: 'Your FasalGuard AI account is ready',
      text: `Your FasalGuard AI account is ready.\n\nSign in anytime with your email or phone number: ${message.recipient}. No password is needed.\n\nIf you did not create this account, ignore this email.`,
      html: `<p>Your FasalGuard AI account is ready.</p><p>Sign in anytime with your email or phone number: <strong>${message.recipient}</strong>. No password is needed.</p><p>If you did not create this account, ignore this email.</p>`,
    });
  }

  async sendWeatherAlert(message: WeatherAlertEmail): Promise<void> {
    const { transporter, from } = this.transport();
    const severity = message.suitability === 'CRITICAL' ? 'Critical weather' : 'Weather';
    await transporter.sendMail({
      from,
      to: message.recipient,
      subject: `${severity} risk for ${message.fieldName}: ${message.condition}`,
      text: `${message.condition} risk detected for ${message.fieldName}.\n\n${message.guidance}\n\nThis is an automated weather-risk alert from FasalGuard AI. You can manage notification preferences in the app.`,
      html: `<p><strong>${message.condition}</strong> risk detected for <strong>${message.fieldName}</strong>.</p><p>${message.guidance}</p><p style="color:#666;font-size:12px">This is an automated weather-risk alert from FasalGuard AI. You can manage notification preferences in the app.</p>`,
    });
  }

  async sendOnboardingReminder(message: OnboardingReminderEmail): Promise<void> {
    const { transporter, from } = this.transport();
    await transporter.sendMail({
      from,
      to: message.recipient,
      subject: "You're one step away from monitoring your farm",
      text: `Hi ${message.fullName},\n\nYou created a FasalGuard AI account but haven't added a farm yet. Add your farm boundary to start receiving weather and crop-health insights.\n\nYou can manage notification preferences anytime in the app.`,
      html: `<p>Hi ${message.fullName},</p><p>You created a FasalGuard AI account but haven't added a farm yet. Add your farm boundary to start receiving weather and crop-health insights.</p><p style="color:#666;font-size:12px">You can manage notification preferences anytime in the app.</p>`,
    });
  }

  async sendRoadmapReady(message: RoadmapReadyEmail): Promise<void> {
    const { transporter, from } = this.transport();
    await transporter.sendMail({
      from,
      to: message.recipient,
      subject: `Your first farm investigation for ${message.farmName} is ready`,
      text: `Your first Gemini-powered farm investigation for ${message.farmName} has finished. Open the app to review findings and recommended actions.\n\nYou can manage notification preferences anytime in the app.`,
      html: `<p>Your first Gemini-powered farm investigation for <strong>${message.farmName}</strong> has finished.</p><p>Open the app to review findings and recommended actions.</p><p style="color:#666;font-size:12px">You can manage notification preferences anytime in the app.</p>`,
    });
  }

  async sendInsightReady(message: InsightReadyEmail): Promise<void> {
    const { transporter, from } = this.transport();
    await transporter.sendMail({
      from,
      to: message.recipient,
      subject: `Your crop scan result for ${message.context} is ready`,
      text: `Your crop scan for ${message.context} has been screened: ${message.diagnosis}. This is an AI screening, not a confirmed diagnosis — open the app for full details and next steps.\n\nYou can manage notification preferences anytime in the app.`,
      html: `<p>Your crop scan for <strong>${message.context}</strong> has been screened: <strong>${message.diagnosis}</strong>.</p><p>This is an AI screening, not a confirmed diagnosis — open the app for full details and next steps.</p><p style="color:#666;font-size:12px">You can manage notification preferences anytime in the app.</p>`,
    });
  }

  async sendWeeklySummary(message: WeeklySummaryEmail): Promise<void> {
    const { transporter, from } = this.transport();
    await transporter.sendMail({
      from,
      to: message.recipient,
      subject: 'Your weekly farm summary',
      text: `This week: ${message.pendingTasks} pending task(s), ${message.completedTasks} completed task(s). Open the app for full details.\n\nYou can manage notification preferences anytime in the app.`,
      html: `<p>This week: <strong>${message.pendingTasks}</strong> pending task(s), <strong>${message.completedTasks}</strong> completed task(s).</p><p>Open the app for full details.</p><p style="color:#666;font-size:12px">You can manage notification preferences anytime in the app.</p>`,
    });
  }

  private transport(): { transporter: Transporter; from: string } {
    const host = this.config.get<string>('smtpHost');
    const from = this.config.get<string>('smtpFrom');
    if (!host || !from) {
      throw new ServiceUnavailableException({
        code: 'EMAIL_NOT_CONFIGURED',
        message: 'Account email delivery is not configured.',
      });
    }
    const port = this.config.get<number>('smtpPort', 587);
    const user = this.config.get<string>('smtpUser');
    const pass = this.config.get<string>('smtpPassword');
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
      auth: user && pass ? { user, pass } : undefined,
    });
    return { transporter, from };
  }
}
