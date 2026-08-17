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
  objectStorageProvider: 'mock' | 'alibaba';
  ossRegion: string;
  ossBucket: string;
  ossAccessKeyId: string;
  ossAccessKeySecret: string;
  sentinelHubClientId: string;
  sentinelHubClientSecret: string;
  sentinelHubBaseUrl: string;
  satelliteMaxCloudCoverage: number;
  geospatialAiUrl: string;
  satelliteMonitoringIntervalHours: number;
  satelliteProviderRequestsPerMinute: number;
  openMeteoBaseUrl: string;
  weatherCacheTtlSeconds: number;
  visionProvider: 'roboflow' | 'self-hosted';
  roboflowBaseUrl: string;
  roboflowApiKey: string;
  roboflowModelId: string;
  roboflowModelVersion: string;
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
    objectStorageProvider: (process.env.OBJECT_STORAGE_PROVIDER ?? 'mock') as 'mock' | 'alibaba',
    ossRegion: process.env.OSS_REGION ?? '',
    ossBucket: process.env.OSS_BUCKET ?? '',
    ossAccessKeyId: process.env.OSS_ACCESS_KEY_ID ?? '',
    ossAccessKeySecret: process.env.OSS_ACCESS_KEY_SECRET ?? '',
    sentinelHubClientId: process.env.SENTINEL_HUB_CLIENT_ID ?? '',
    sentinelHubClientSecret: process.env.SENTINEL_HUB_CLIENT_SECRET ?? '',
    sentinelHubBaseUrl: process.env.SENTINEL_HUB_BASE_URL ?? 'https://services.sentinel-hub.com',
    satelliteMaxCloudCoverage: Number(process.env.SATELLITE_MAX_CLOUD_COVERAGE ?? 30),
    geospatialAiUrl: process.env.GEOSPATIAL_AI_URL ?? 'http://localhost:8000',
    satelliteMonitoringIntervalHours: Number(process.env.SATELLITE_MONITORING_INTERVAL_HOURS ?? 8),
    satelliteProviderRequestsPerMinute: Number(
      process.env.SATELLITE_PROVIDER_REQUESTS_PER_MINUTE ?? 30,
    ),
    openMeteoBaseUrl: process.env.OPEN_METEO_BASE_URL ?? 'https://api.open-meteo.com',
    weatherCacheTtlSeconds: Number(process.env.WEATHER_CACHE_TTL_SECONDS ?? 900),
    visionProvider: (process.env.VISION_PROVIDER ?? 'self-hosted') as 'roboflow' | 'self-hosted',
    roboflowBaseUrl: process.env.ROBOFLOW_BASE_URL ?? 'https://detect.roboflow.com',
    roboflowApiKey: process.env.ROBOFLOW_API_KEY ?? '',
    roboflowModelId: process.env.ROBOFLOW_MODEL_ID ?? '',
    roboflowModelVersion: process.env.ROBOFLOW_MODEL_VERSION ?? '',
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
  };
}
