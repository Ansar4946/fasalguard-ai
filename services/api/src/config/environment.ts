import * as Joi from 'joi';
export const environmentSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(4000),
  PROCESS_ROLE: Joi.string().valid('api', 'worker', 'all').default('all'),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
  DATABASE_SSL: Joi.boolean().truthy('true').falsy('false').default(false),
  // Documented production override for private-network databases that cannot terminate TLS.
  ALLOW_PLAINTEXT_DATABASE: Joi.boolean().truthy('true').falsy('false').default(false),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .required(),
  // Express 'trust proxy': 'false' (default), or the number of trusted reverse-proxy hops.
  // 'true' (trust every hop) is accepted outside production only.
  TRUST_PROXY: Joi.string()
    .pattern(/^(false|true|[1-9]\d?)$/)
    .default('false'),
  INTERNAL_SERVICE_TOKEN: Joi.string().allow('').default(''),
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
  AMIS_BASE_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .default('http://www.amis.pk'),
  AMIS_TIMEOUT_SECONDS: Joi.number().integer().min(5).max(60).default(30),
  AMIS_REQUEST_DELAY_SECONDS: Joi.number().min(0).max(10).default(1),
  MARKET_CACHE_TTL_SECONDS: Joi.number().integer().min(60).max(86_400).default(3600),
  MARKET_MAX_AGE_DAYS: Joi.number().integer().min(0).max(30).default(1),
  SATELLITE_MONITORING_INTERVAL_HOURS: Joi.number().integer().min(6).max(12).default(8),
  SATELLITE_PROVIDER_REQUESTS_PER_MINUTE: Joi.number().integer().min(1).max(300).default(30),
  WEATHER_PROVIDER: Joi.string().valid('open-meteo', 'openweathermap').default('open-meteo'),
  OPEN_METEO_BASE_URL: Joi.string().uri().default('https://api.open-meteo.com'),
  OPEN_METEO_API_KEY: Joi.string().allow('').default(''),
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
  ASSISTANT_PROVIDER: Joi.string().valid('fake', 'qwen', 'gemini', 'extractive').default('fake'),
  RATE_LIMIT_PER_MINUTE: Joi.number().integer().min(30).max(10_000).default(120),
  ASSISTANT_TIMEOUT_MS: Joi.number().integer().min(2_000).max(60_000).default(20_000),
  ASSISTANT_MAX_CONTEXT_MESSAGES: Joi.number().integer().min(0).max(20).default(10),
  ASSISTANT_RETRIEVAL_LIMIT: Joi.number().integer().min(1).max(8).default(4),
  DAWAI_CHECK_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  LABEL_READER_PROVIDER: Joi.string()
    .valid('tesseract', 'openai-compatible', 'fake')
    .default('tesseract'),
  LABEL_OCR_LANGS: Joi.string()
    .pattern(/^[a-z]{3}(\+[a-z]{3})*$/)
    .default('eng'),
  LABEL_VISION_BASE_URL: Joi.string().uri().allow('').default(''),
  LABEL_VISION_API_KEY: Joi.string().allow('').default(''),
  LABEL_VISION_MODEL: Joi.string().allow('').default(''),
  SPEECH_PROVIDER: Joi.string().valid('fake', 'qwen', 'azure').default('fake'),
  SPEECH_STT_PROVIDER: Joi.string().valid('', 'assemblyai').default(''),
  ASSEMBLYAI_API_KEY: Joi.string().allow('').default(''),
  AZURE_SPEECH_KEY: Joi.string().allow('').default(''),
  AZURE_SPEECH_REGION: Joi.string()
    .pattern(/^[a-z0-9-]+$/)
    .allow('')
    .default(''),
  SPEECH_PROVIDER_TIMEOUT_MS: Joi.number().integer().min(5_000).max(30_000).default(20_000),
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
  USSD_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  USSD_DEMO_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  USSD_GATEWAY: Joi.string().valid('contract-test').default('contract-test'),
  USSD_CALLBACK_SECRET: Joi.string().allow('').default(''),
  USSD_SESSION_TTL_SECONDS: Joi.number().integer().min(60).max(900).default(300),
  USSD_PIN_MAX_ATTEMPTS: Joi.number().integer().min(3).max(10).default(5),
  USSD_PIN_LOCK_SECONDS: Joi.number().integer().min(60).max(86400).default(900),
  USSD_MAX_AMOUNT_MINOR: Joi.number().integer().min(100).max(100000000).default(100000000),
}).custom((value: Record<string, unknown>, helpers) => {
  if (value.NODE_ENV !== 'production') return value;
  const required = (key: string): boolean =>
    typeof value[key] === 'string' && String(value[key]).trim().length > 0;
  if (
    value.USSD_ENABLED === true &&
    (typeof value.USSD_CALLBACK_SECRET !== 'string' || value.USSD_CALLBACK_SECRET.length < 32)
  )
    return helpers.error('any.invalid', {
      message: 'Enabled production USSD requires a callback secret of at least 32 characters.',
    });
  if (value.USSD_ENABLED === true && value.USSD_GATEWAY === 'contract-test')
    return helpers.error('any.invalid', {
      message: 'The test-only USSD gateway adapter cannot be enabled in production.',
    });
  if (value.ENABLE_SWAGGER === true)
    return helpers.error('any.invalid', { message: 'Swagger must be disabled in production.' });
  if (value.DATABASE_SSL !== true && value.ALLOW_PLAINTEXT_DATABASE !== true)
    return helpers.error('any.invalid', {
      message:
        'Production requires DATABASE_SSL=true (or the documented ALLOW_PLAINTEXT_DATABASE=true override).',
    });
  if (new URL(String(value.REDIS_URL)).protocol !== 'rediss:')
    return helpers.error('any.invalid', { message: 'Production REDIS_URL must use rediss://.' });
  if (value.TRUST_PROXY === 'true')
    return helpers.error('any.invalid', {
      message: 'Production TRUST_PROXY must be false or an explicit proxy hop count, not true.',
    });
  if (!required('INTERNAL_SERVICE_TOKEN') || String(value.INTERNAL_SERVICE_TOKEN).length < 32)
    return helpers.error('any.invalid', {
      message: 'Production requires INTERNAL_SERVICE_TOKEN of at least 32 characters.',
    });
  const stripeKeys = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PUBLISHABLE_KEY'];
  // Billing is considered enabled as soon as any Stripe key is supplied; it must then be complete.
  if (stripeKeys.some(required) && !stripeKeys.every(required))
    return helpers.error('any.invalid', {
      message: 'Billing is enabled but Stripe configuration is incomplete: set all Stripe keys.',
    });
  const isLocalHost = (host: string): boolean =>
    ['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1'].includes(host) ||
    host.endsWith('.localhost');
  for (const key of ['WEB_APP_URL', 'API_PUBLIC_URL']) {
    const target = new URL(String(value[key]));
    if (isLocalHost(target.hostname) || target.protocol !== 'https:' || target.username)
      return helpers.error('any.invalid', {
        message: `${key} must be a public HTTPS URL (not localhost) in production.`,
      });
  }
  for (const origin of String(value.CORS_ORIGINS).split(',')) {
    const trimmed = origin.trim();
    if (!trimmed) continue;
    let host: string;
    try {
      host = new URL(trimmed).hostname;
    } catch {
      return helpers.error('any.invalid', {
        message: 'Production CORS origins must be valid URLs.',
      });
    }
    if (isLocalHost(host))
      return helpers.error('any.invalid', {
        message: 'Production CORS origins must not include localhost.',
      });
  }
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
  if (value.SPEECH_PROVIDER === 'fake' && value.SPEECH_STT_PROVIDER !== 'assemblyai')
    return helpers.error('any.invalid', {
      message: 'Fake speech is forbidden in production.',
    });
  if (value.SPEECH_STT_PROVIDER === 'assemblyai' && !required('ASSEMBLYAI_API_KEY'))
    return helpers.error('any.invalid', {
      message: 'Selected AssemblyAI credentials are missing.',
    });
  if (
    value.DAWAI_CHECK_ENABLED === true &&
    value.LABEL_READER_PROVIDER === 'openai-compatible' &&
    (!required('LABEL_VISION_BASE_URL') ||
      !required('LABEL_VISION_API_KEY') ||
      !required('LABEL_VISION_MODEL'))
  )
    return helpers.error('any.invalid', {
      message:
        'Dawai Check with the openai-compatible label reader requires the vision URL, key and model.',
    });
  if (value.DAWAI_CHECK_ENABLED === true && value.LABEL_READER_PROVIDER === 'fake')
    return helpers.error('any.invalid', {
      message: 'The fake label reader is forbidden in production.',
    });
  if (value.ASSISTANT_PROVIDER === 'fake')
    return helpers.error('any.invalid', {
      message: 'The fake assistant is forbidden in production.',
    });
  if (value.ASSISTANT_PROVIDER === 'qwen' && !required('QWEN_API_KEY'))
    return helpers.error('any.invalid', {
      message: 'Selected Qwen assistant credentials are missing.',
    });
  if (value.ASSISTANT_PROVIDER === 'gemini' && !required('GEMINI_API_KEY'))
    return helpers.error('any.invalid', {
      message: 'Selected Gemini assistant credentials are missing.',
    });
  if (
    value.SPEECH_PROVIDER === 'azure' &&
    (!required('AZURE_SPEECH_KEY') || !required('AZURE_SPEECH_REGION'))
  )
    return helpers.error('any.invalid', {
      message: 'Selected Azure Speech credentials are missing.',
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
    value.WEATHER_PROVIDER === 'open-meteo' &&
    (!required('OPEN_METEO_API_KEY') ||
      new URL(String(value.OPEN_METEO_BASE_URL)).hostname !== 'customer-api.open-meteo.com')
  )
    return helpers.error('any.invalid', {
      message: 'Production Open-Meteo requires commercial credentials and the customer endpoint.',
    });
  if (
    (value.ASSISTANT_PROVIDER === 'qwen' || value.SPEECH_PROVIDER === 'qwen') &&
    !required('QWEN_API_KEY')
  )
    return helpers.error('any.invalid', {
      message: 'Selected Qwen provider credentials are missing.',
    });
  if (value.PUSH_PROVIDER === 'development')
    return helpers.error('any.invalid', {
      message:
        'The development push provider reports unsent messages as SENT and is forbidden in production.',
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
