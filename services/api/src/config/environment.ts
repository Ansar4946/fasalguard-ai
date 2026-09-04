import * as Joi from 'joi';
export const environmentSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(4000),
  PROCESS_ROLE: Joi.string().valid('api', 'worker', 'all').default('all'),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
  DATABASE_SSL: Joi.boolean().truthy('true').falsy('false').default(false),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .required(),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),
  METRICS_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  METRICS_TOKEN: Joi.string().allow('').default(''),
  SENTRY_DSN: Joi.string().allow('').default(''),
  SENTRY_ENVIRONMENT: Joi.string().max(64).default('development'),
  ENABLE_SWAGGER: Joi.boolean().truthy('true').falsy('false').default(false),
  CORS_ORIGINS: Joi.string().allow('').default('http://localhost:3000'),
  MAX_REQUEST_BODY_BYTES: Joi.number().integer().min(16_384).max(1_048_576).default(262_144),
  SIGNED_URL_TTL_SECONDS: Joi.number().integer().min(60).max(900).default(300),
  ENFORCE_FIELD_WITHIN_FARM: Joi.boolean().truthy('true').falsy('false').default(true),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ISSUER: Joi.string().min(3).default('fasalguard-api'),
  JWT_AUDIENCE: Joi.string().min(3).default('fasalguard-clients'),
  ACCESS_TOKEN_TTL_SECONDS: Joi.number().integer().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: Joi.number().integer().min(1).max(90).default(30),
  OTP_PROVIDER: Joi.string().valid('development', 'production').default('development'),
  WEB_APP_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .default('http://localhost:3000'),
  PASSWORD_SETUP_TTL_MINUTES: Joi.number().integer().min(10).max(120).default(30),
  SMTP_HOST: Joi.string().allow('').default(''),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_USER: Joi.string().allow('').default(''),
  SMTP_PASSWORD: Joi.string().allow('').default(''),
  SMTP_FROM: Joi.string().allow('').default(''),
  OBJECT_STORAGE_PROVIDER: Joi.string().valid('mock', 'alibaba', 'local-disk').default('mock'),
  OSS_REGION: Joi.string().allow('').default(''),
  OSS_BUCKET: Joi.string().allow('').default(''),
  OSS_ACCESS_KEY_ID: Joi.string().allow('').default(''),
  OSS_ACCESS_KEY_SECRET: Joi.string().allow('').default(''),
  MEDIA_LOCAL_DIR: Joi.string().default('/data/media'),
  API_PUBLIC_URL: Joi.string().uri().default('http://localhost:4000/api/v1'),
  STRIPE_SECRET_KEY: Joi.string().allow('').default(''),
  STRIPE_WEBHOOK_SECRET: Joi.string().allow('').default(''),
  STRIPE_PUBLISHABLE_KEY: Joi.string().allow('').default(''),
  SENTINEL_HUB_CLIENT_ID: Joi.string().allow('').default(''),
  SENTINEL_HUB_CLIENT_SECRET: Joi.string().allow('').default(''),
  SENTINEL_HUB_BASE_URL: Joi.string().uri().default('https://services.sentinel-hub.com'),
  SENTINEL_HUB_AUTH_URL: Joi.string()
    .uri()
    .default('https://services.sentinel-hub.com/auth/realms/main/protocol/openid-connect/token'),
  SATELLITE_MAX_CLOUD_COVERAGE: Joi.number().min(0).max(100).default(30),
  SATELLITE_MIN_VALID_PIXEL_PERCENTAGE: Joi.number().min(1).max(100).default(20),
  GEOSPATIAL_AI_URL: Joi.string().uri().default('http://localhost:8000'),
  AMIS_SYNC_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  AMIS_SCRAPE_TIMEOUT_MS: Joi.number().integer().min(10_000).max(180_000).default(120_000),
  MARKET_CACHE_TTL_SECONDS: Joi.number().integer().min(60).max(86_400).default(3600),
  SATELLITE_MONITORING_INTERVAL_HOURS: Joi.number().integer().min(6).max(12).default(8),
  SATELLITE_PROVIDER_REQUESTS_PER_MINUTE: Joi.number().integer().min(1).max(300).default(30),
  WEATHER_PROVIDER: Joi.string().valid('open-meteo', 'openweathermap').default('open-meteo'),
  OPEN_METEO_BASE_URL: Joi.string().uri().default('https://api.open-meteo.com'),
  OPENWEATHERMAP_BASE_URL: Joi.string().uri().default('https://api.openweathermap.org'),
  OPENWEATHERMAP_API_KEY: Joi.string().allow('').default(''),
  WEATHER_CACHE_TTL_SECONDS: Joi.number().integer().min(300).max(3600).default(900),
  WEATHER_ALERT_MIN_INTERVAL_HOURS: Joi.number().integer().min(1).max(72).default(12),
  VISION_PROVIDER: Joi.string().valid('roboflow', 'self-hosted').default('self-hosted'),
  ROBOFLOW_BASE_URL: Joi.string().uri().default('https://detect.roboflow.com'),
  ROBOFLOW_API_KEY: Joi.string().allow('').default(''),
  ROBOFLOW_MODEL_ID: Joi.string().allow('').default(''),
  ROBOFLOW_MODEL_VERSION: Joi.string().allow('').default(''),
  ROBOFLOW_MODEL_TASK: Joi.string().valid('classification', 'detection').default('classification'),
  ROBOFLOW_WHEAT_MODEL_ID: Joi.string().allow('').default(''),
  ROBOFLOW_WHEAT_MODEL_VERSION: Joi.string().allow('').default(''),
  ROBOFLOW_WHEAT_MODEL_TASK: Joi.string()
    .valid('classification', 'detection')
    .default('classification'),
  ROBOFLOW_RICE_MODEL_ID: Joi.string().allow('').default(''),
  ROBOFLOW_RICE_MODEL_VERSION: Joi.string().allow('').default(''),
  ROBOFLOW_RICE_MODEL_TASK: Joi.string()
    .valid('classification', 'detection')
    .default('classification'),
  SELF_HOSTED_VISION_URL: Joi.string().uri().default('http://localhost:8000'),
  VISION_MINIMUM_CONFIDENCE: Joi.number().min(0).max(1).default(0.65),
  VISION_EXPERT_REVIEW_BELOW: Joi.number().min(0).max(1).default(0.85),
  QWEN_BASE_URL: Joi.string().uri().default('https://dashscope-intl.aliyuncs.com'),
  QWEN_API_KEY: Joi.string().allow('').default(''),
  QWEN_MODEL: Joi.string().min(1).default('qwen-plus'),
  PUSH_PROVIDER: Joi.string().valid('development', 'firebase').default('development'),
  FIREBASE_SERVICE_ACCOUNT_BASE64: Joi.string().allow('').default(''),
  PUSH_TOKEN_STALE_DAYS: Joi.number().integer().min(7).max(365).default(90),
  ASSISTANT_PROVIDER: Joi.string().valid('fake', 'qwen').default('fake'),
  SPEECH_PROVIDER: Joi.string().valid('fake', 'qwen').default('fake'),
  QWEN_STT_MODEL: Joi.string().min(1).default('qwen-audio-asr'),
  QWEN_TTS_MODEL: Joi.string().min(1).default('qwen-tts'),
  FARM_BRAIN_PROVIDER: Joi.string().valid('fake', 'gemini').default('fake'),
  GEMINI_TRANSPORT: Joi.string().valid('google-ai', 'vertex').default('google-ai'),
  GEMINI_API_KEY: Joi.string().allow('').default(''),
  GEMINI_MODEL: Joi.string().min(1).max(120).default('gemini-3.6-flash'),
  GEMINI_TIMEOUT_MS: Joi.number().integer().min(5_000).max(120_000).default(30_000),
  GEMINI_INPUT_PRICE_PER_MILLION_TOKENS: Joi.number().min(0).optional(),
  GEMINI_OUTPUT_PRICE_PER_MILLION_TOKENS: Joi.number().min(0).optional(),
  GOOGLE_CLOUD_PROJECT: Joi.string().allow('').max(120).default(''),
  GOOGLE_CLOUD_LOCATION: Joi.string().min(2).max(40).default('us-central1'),
  GOOGLE_ACCESS_TOKEN: Joi.string().allow('').default(''),
}).custom((value: Record<string, unknown>, helpers) => {
  if (value.NODE_ENV !== 'production') return value;
  const required = (key: string): boolean =>
    typeof value[key] === 'string' && String(value[key]).trim().length > 0;
  if (value.ENABLE_SWAGGER === true)
    return helpers.error('any.invalid', { message: 'Swagger must be disabled in production.' });
  if (value.METRICS_ENABLED === true && !required('METRICS_TOKEN'))
    return helpers.error('any.invalid', { message: 'Production metrics require an access token.' });
  if (required('SENTRY_DSN')) {
    const dsn = new URL(String(value.SENTRY_DSN));
    if (dsn.protocol !== 'https:' || !dsn.username)
      return helpers.error('any.invalid', { message: 'Sentry DSN must use authenticated HTTPS.' });
  }
  if (!required('CORS_ORIGINS') || String(value.CORS_ORIGINS).includes('*'))
    return helpers.error('any.invalid', { message: 'Production CORS requires explicit origins.' });
  if (
    String(value.JWT_ACCESS_SECRET).length < 48 ||
    String(value.JWT_ACCESS_SECRET).includes('replace-with')
  )
    return helpers.error('any.invalid', { message: 'Production JWT secret is unsafe.' });
  for (const key of [
    'SENTINEL_HUB_BASE_URL',
    'OPEN_METEO_BASE_URL',
    'OPENWEATHERMAP_BASE_URL',
    'ROBOFLOW_BASE_URL',
    'QWEN_BASE_URL',
  ]) {
    const target = new URL(String(value[key]));
    if (target.protocol !== 'https:' || target.username || target.password || target.hash)
      return helpers.error('any.invalid', {
        message: `${key} must be a credential-free HTTPS origin in production.`,
      });
  }
  for (const key of ['GEOSPATIAL_AI_URL', 'SELF_HOSTED_VISION_URL']) {
    const target = new URL(String(value[key]));
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password)
      return helpers.error('any.invalid', { message: `${key} is not a safe service URL.` });
  }
  if (
    value.OBJECT_STORAGE_PROVIDER !== 'alibaba' ||
    !required('OSS_REGION') ||
    !required('OSS_BUCKET') ||
    !required('OSS_ACCESS_KEY_ID') ||
    !required('OSS_ACCESS_KEY_SECRET')
  )
    return helpers.error('any.invalid', {
      message: 'Production requires configured private Alibaba OSS.',
    });
  if (value.OTP_PROVIDER !== 'production')
    return helpers.error('any.invalid', { message: 'Development OTP is forbidden in production.' });
  for (const key of ['SMTP_HOST', 'SMTP_FROM'])
    if (!required(key))
      return helpers.error('any.invalid', {
        message: 'Production account email delivery requires SMTP configuration.',
      });
  if (value.VISION_PROVIDER === 'roboflow' && !required('ROBOFLOW_API_KEY'))
    return helpers.error('any.invalid', {
      message: 'Selected vision provider credentials are missing.',
    });
  if (value.WEATHER_PROVIDER === 'openweathermap' && !required('OPENWEATHERMAP_API_KEY'))
    return helpers.error('any.invalid', {
      message: 'Selected weather provider credentials are missing.',
    });
  if (
    (value.ASSISTANT_PROVIDER === 'qwen' || value.SPEECH_PROVIDER === 'qwen') &&
    !required('QWEN_API_KEY')
  )
    return helpers.error('any.invalid', {
      message: 'Selected Qwen provider credentials are missing.',
    });
  if (value.PUSH_PROVIDER === 'firebase' && !required('FIREBASE_SERVICE_ACCOUNT_BASE64'))
    return helpers.error('any.invalid', {
      message: 'Selected push provider credentials are missing.',
    });
  if (value.FARM_BRAIN_PROVIDER !== 'gemini')
    return helpers.error('any.invalid', { message: 'Production Farm Brain must use Gemini.' });
  if (value.GEMINI_TRANSPORT === 'google-ai' && !required('GEMINI_API_KEY'))
    return helpers.error('any.invalid', { message: 'Gemini API credentials are missing.' });
  if (value.GEMINI_TRANSPORT === 'vertex' && !required('GOOGLE_CLOUD_PROJECT'))
    return helpers.error('any.invalid', { message: 'Vertex AI project configuration is missing.' });
  return value;
});
