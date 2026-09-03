export interface AppConfiguration {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  databaseSsl: boolean;
  redisUrl: string;
  logLevel: string;
  metricsEnabled: boolean;
  metricsToken: string;
  sentryDsn: string;
  sentryEnvironment: string;
  enableSwagger: boolean;
  corsOrigins: string[];
  maxRequestBodyBytes: number;
  signedUrlTtlSeconds: number;
  enforceFieldWithinFarm: boolean;
  jwtAccessSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
  otpProvider: 'development' | 'production';
  webAppUrl: string;
  passwordSetupTtlMinutes: number;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  smtpFrom: string;
  objectStorageProvider: 'mock' | 'alibaba' | 'local-disk';
  ossRegion: string;
  ossBucket: string;
  ossAccessKeyId: string;
  ossAccessKeySecret: string;
  mediaLocalDir: string;
  apiPublicUrl: string;
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  stripePublishableKey: string;
  sentinelHubClientId: string;
  sentinelHubClientSecret: string;
  sentinelHubBaseUrl: string;
  sentinelHubAuthUrl: string;
  satelliteMaxCloudCoverage: number;
  satelliteMinValidPixelPercentage: number;
  geospatialAiUrl: string;
  amisSyncEnabled: boolean;
  amisScrapeTimeoutMs: number;
  marketCacheTtlSeconds: number;
  satelliteMonitoringIntervalHours: number;
  satelliteProviderRequestsPerMinute: number;
  weatherProvider: 'open-meteo' | 'openweathermap';
  openMeteoBaseUrl: string;
  openWeatherMapBaseUrl: string;
  openWeatherMapApiKey: string;
  weatherCacheTtlSeconds: number;
  weatherAlertMinIntervalHours: number;
  visionProvider: 'roboflow' | 'self-hosted';
  roboflowBaseUrl: string;
  roboflowApiKey: string;
  roboflowModelId: string;
  roboflowModelVersion: string;
  roboflowModelTask: 'classification' | 'detection';
  selfHostedVisionUrl: string;
  visionMinimumConfidence: number;
  visionExpertReviewBelow: number;
  qwenBaseUrl: string;
  qwenApiKey: string;
  qwenModel: string;
  pushProvider: 'development' | 'firebase';
  firebaseServiceAccountBase64: string;
  pushTokenStaleDays: number;
  assistantProvider: 'fake' | 'qwen';
  speechProvider: 'fake' | 'qwen';
  qwenSttModel: string;
  qwenTtsModel: string;
  farmBrainProvider: 'fake' | 'gemini';
  geminiTransport: 'google-ai' | 'vertex';
  geminiApiKey: string;
  geminiModel: string;
  geminiTimeoutMs: number;
  geminiInputPricePerMillionTokens: number | null;
  geminiOutputPricePerMillionTokens: number | null;
  googleCloudProject: string;
  googleCloudLocation: string;
  googleAccessToken: string;
}
export default function configuration(): AppConfiguration {
  return {
    nodeEnv: process.env.NODE_ENV as AppConfiguration['nodeEnv'],
    port: Number(process.env.PORT),
    databaseUrl: process.env.DATABASE_URL ?? '',
    databaseSsl: process.env.DATABASE_SSL === 'true',
    redisUrl: process.env.REDIS_URL ?? '',
    logLevel: process.env.LOG_LEVEL ?? 'info',
    metricsEnabled: process.env.METRICS_ENABLED !== 'false',
    metricsToken: process.env.METRICS_TOKEN ?? '',
    sentryDsn: process.env.SENTRY_DSN ?? '',
    sentryEnvironment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    enableSwagger: process.env.ENABLE_SWAGGER === 'true',
    corsOrigins: (process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
    maxRequestBodyBytes: Number(process.env.MAX_REQUEST_BODY_BYTES ?? 262144),
    signedUrlTtlSeconds: Number(process.env.SIGNED_URL_TTL_SECONDS ?? 300),
    enforceFieldWithinFarm: process.env.ENFORCE_FIELD_WITHIN_FARM !== 'false',
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? '',
    jwtIssuer: process.env.JWT_ISSUER ?? 'fasalguard-api',
    jwtAudience: process.env.JWT_AUDIENCE ?? 'fasalguard-clients',
    accessTokenTtlSeconds: Number(process.env.ACCESS_TOKEN_TTL_SECONDS ?? 900),
    refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30),
    otpProvider: (process.env.OTP_PROVIDER ?? 'development') as 'development' | 'production',
    webAppUrl: process.env.WEB_APP_URL ?? 'http://localhost:3000',
    passwordSetupTtlMinutes: Number(process.env.PASSWORD_SETUP_TTL_MINUTES ?? 30),
    smtpHost: process.env.SMTP_HOST ?? '',
    smtpPort: Number(process.env.SMTP_PORT ?? 587),
    smtpUser: process.env.SMTP_USER ?? '',
    smtpPassword: process.env.SMTP_PASSWORD ?? '',
    smtpFrom: process.env.SMTP_FROM ?? '',
    objectStorageProvider: (process.env.OBJECT_STORAGE_PROVIDER ?? 'mock') as
      'mock' | 'alibaba' | 'local-disk',
    ossRegion: process.env.OSS_REGION ?? '',
    ossBucket: process.env.OSS_BUCKET ?? '',
    ossAccessKeyId: process.env.OSS_ACCESS_KEY_ID ?? '',
    ossAccessKeySecret: process.env.OSS_ACCESS_KEY_SECRET ?? '',
    mediaLocalDir: process.env.MEDIA_LOCAL_DIR ?? '/data/media',
    apiPublicUrl: process.env.API_PUBLIC_URL ?? 'http://localhost:4000/api/v1',
    stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? '',
    sentinelHubClientId: process.env.SENTINEL_HUB_CLIENT_ID ?? '',
    sentinelHubClientSecret: process.env.SENTINEL_HUB_CLIENT_SECRET ?? '',
    sentinelHubBaseUrl: process.env.SENTINEL_HUB_BASE_URL ?? 'https://services.sentinel-hub.com',
    sentinelHubAuthUrl:
      process.env.SENTINEL_HUB_AUTH_URL ??
      'https://services.sentinel-hub.com/auth/realms/main/protocol/openid-connect/token',
    satelliteMaxCloudCoverage: Number(process.env.SATELLITE_MAX_CLOUD_COVERAGE ?? 30),
    satelliteMinValidPixelPercentage: Number(
      process.env.SATELLITE_MIN_VALID_PIXEL_PERCENTAGE ?? 20,
    ),
    geospatialAiUrl: process.env.GEOSPATIAL_AI_URL ?? 'http://localhost:8000',
    amisSyncEnabled: process.env.AMIS_SYNC_ENABLED === 'true',
    amisScrapeTimeoutMs: Number(process.env.AMIS_SCRAPE_TIMEOUT_MS ?? 120000),
    marketCacheTtlSeconds: Number(process.env.MARKET_CACHE_TTL_SECONDS ?? 3600),
    satelliteMonitoringIntervalHours: Number(process.env.SATELLITE_MONITORING_INTERVAL_HOURS ?? 8),
    satelliteProviderRequestsPerMinute: Number(
      process.env.SATELLITE_PROVIDER_REQUESTS_PER_MINUTE ?? 30,
    ),
    weatherProvider: (process.env.WEATHER_PROVIDER ?? 'open-meteo') as
      'open-meteo' | 'openweathermap',
    openMeteoBaseUrl: process.env.OPEN_METEO_BASE_URL ?? 'https://api.open-meteo.com',
    openWeatherMapBaseUrl: process.env.OPENWEATHERMAP_BASE_URL ?? 'https://api.openweathermap.org',
    openWeatherMapApiKey: process.env.OPENWEATHERMAP_API_KEY ?? '',
    weatherCacheTtlSeconds: Number(process.env.WEATHER_CACHE_TTL_SECONDS ?? 900),
    weatherAlertMinIntervalHours: Number(process.env.WEATHER_ALERT_MIN_INTERVAL_HOURS ?? 12),
    visionProvider: (process.env.VISION_PROVIDER ?? 'self-hosted') as 'roboflow' | 'self-hosted',
    roboflowBaseUrl: process.env.ROBOFLOW_BASE_URL ?? 'https://detect.roboflow.com',
    roboflowApiKey: process.env.ROBOFLOW_API_KEY ?? '',
    roboflowModelId: process.env.ROBOFLOW_MODEL_ID ?? '',
    roboflowModelVersion: process.env.ROBOFLOW_MODEL_VERSION ?? '',
    roboflowModelTask: (process.env.ROBOFLOW_MODEL_TASK ?? 'classification') as
      'classification' | 'detection',
    selfHostedVisionUrl: process.env.SELF_HOSTED_VISION_URL ?? 'http://localhost:8000',
    visionMinimumConfidence: Number(process.env.VISION_MINIMUM_CONFIDENCE ?? 0.65),
    visionExpertReviewBelow: Number(process.env.VISION_EXPERT_REVIEW_BELOW ?? 0.85),
    qwenBaseUrl: process.env.QWEN_BASE_URL ?? 'https://dashscope-intl.aliyuncs.com',
    qwenApiKey: process.env.QWEN_API_KEY ?? '',
    qwenModel: process.env.QWEN_MODEL ?? 'qwen-plus',
    pushProvider: (process.env.PUSH_PROVIDER ?? 'development') as 'development' | 'firebase',
    firebaseServiceAccountBase64: process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 ?? '',
    pushTokenStaleDays: Number(process.env.PUSH_TOKEN_STALE_DAYS ?? 90),
    assistantProvider: (process.env.ASSISTANT_PROVIDER ?? 'fake') as 'fake' | 'qwen',
    speechProvider: (process.env.SPEECH_PROVIDER ?? 'fake') as 'fake' | 'qwen',
    qwenSttModel: process.env.QWEN_STT_MODEL ?? 'qwen-audio-asr',
    qwenTtsModel: process.env.QWEN_TTS_MODEL ?? 'qwen-tts',
    farmBrainProvider: (process.env.FARM_BRAIN_PROVIDER ?? 'fake') as 'fake' | 'gemini',
    geminiTransport: (process.env.GEMINI_TRANSPORT ?? 'google-ai') as 'google-ai' | 'vertex',
    geminiApiKey: process.env.GEMINI_API_KEY ?? '',
    geminiModel: process.env.GEMINI_MODEL ?? 'gemini-3.6-flash',
    geminiTimeoutMs: Number(process.env.GEMINI_TIMEOUT_MS ?? 30000),
    // Cost estimation is opt-in and off by default (null) — never a hardcoded/guessed
    // price. An operator must configure real, current per-million-token pricing.
    geminiInputPricePerMillionTokens: process.env.GEMINI_INPUT_PRICE_PER_MILLION_TOKENS
      ? Number(process.env.GEMINI_INPUT_PRICE_PER_MILLION_TOKENS)
      : null,
    geminiOutputPricePerMillionTokens: process.env.GEMINI_OUTPUT_PRICE_PER_MILLION_TOKENS
      ? Number(process.env.GEMINI_OUTPUT_PRICE_PER_MILLION_TOKENS)
      : null,
    googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT ?? '',
    googleCloudLocation: process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1',
    googleAccessToken: process.env.GOOGLE_ACCESS_TOKEN ?? '',
  };
}
