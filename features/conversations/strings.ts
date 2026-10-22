/** Typed en/ur UI dictionary for the voice assistant. No UI literals belong in the JSX. */
export type UiLang = "ur" | "en";
export const UI_LANGS: readonly UiLang[] = ["ur", "en"];
export const UI_DIR: Record<UiLang, "rtl" | "ltr"> = { ur: "rtl", en: "ltr" };

export interface UiStrings {
  langToggleLabel: string;
  langUr: string;
  langEn: string;
  title: string;
  intro: string;
  farm: string;
  noFarm: string;
  warningsTitle: string;
  dismiss: string;
  dismissAria: string;
  noWarnings: string;
  unreadWarnings: (n: number, categories: string) => string;
  readWarnings: string;
  stop: string;
  loadingConversation: string;
  historyUnavailable: (message: string) => string;
  sessionEnded: string;
  noQuestions: string;
  you: string;
  assistant: string;
  fromAccount: string;
  sources: string;
  revision: string;
  listen: string;
  abstained: string;
  retry: string;
  yourQuestion: string;
  ask: string;
  asking: string;
  newConversation: string;
  speechUnsupported: string;
  starterTitle: string;
  starters: readonly string[];
  // Voice panel
  voiceTitle: string;
  voiceHint: string;
  consentLabel: string;
  checkingVoice: string;
  voiceUnavailable: string;
  consentNeeded: string;
  consentOnFile: string;
  consentRecorded: string;
  consentRevoked: string;
  consentFailed: string;
  startRecording: string;
  stopRecording: string;
  recordAgain: string;
  maxTime: (seconds: number) => string;
  stateIdle: string;
  stateRequesting: string;
  stateRecording: string;
  statePreparing: string;
  stateUploading: string;
  stateTranscribing: string;
  stateThinking: string;
  stateSpeaking: string;
  stateReview: string;
  stateError: string;
  errDenied: string;
  errNoMic: string;
  errUnsupported: string;
  errGeneric: string;
  errEmpty: string;
  errFormat: string;
  transcriptLabel: string;
  transcriptPlaceholder: string;
  autoSending: string;
  autoSendOff: string;
  sendNow: string;
  playTranscript: string;
  transcriptWarning: string;
  levelMeter: string;
  elapsed: (seconds: number, max: number) => string;
  // Generic errors
  assistantUnavailable: string;
  conversationNotStarted: string;
  replyNotUnderstood: string;
}

const en: UiStrings = {
  langToggleLabel: "Language",
  langUr: "اردو",
  langEn: "English",
  title: "Ask the agriculture assistant",
  intro:
    "Farming answers use only approved guidance and cite their sources; if none applies, the assistant says so instead of guessing. Questions about your own farms, fields, crop seasons, confirmed expenses and notifications are answered from your account and tagged “From your account”. The assistant only reads your data and never changes it. It is not a substitute for an agriculture expert.",
  farm: "Farm",
  noFarm: "No farm selected",
  warningsTitle: "Warnings for you",
  dismiss: "Dismiss",
  dismissAria: "Dismiss warnings",
  noWarnings: "You have no unread warnings.",
  unreadWarnings: (n, categories) =>
    `${n} unread ${n === 1 ? "warning" : "warnings"}${categories ? ` (${categories})` : ""}`,
  readWarnings: "Read my warnings",
  stop: "Stop",
  loadingConversation: "Loading conversation…",
  historyUnavailable: (message) => `Conversation history is unavailable: ${message}`,
  sessionEnded: "Your session has ended. Sign in again to use the assistant.",
  noQuestions: "No questions yet. Tap the microphone or pick a question below.",
  you: "You",
  assistant: "Assistant",
  fromAccount: "From your account",
  sources: "Sources",
  revision: "revision",
  listen: "Listen",
  abstained: "No approved guidance found — this is not an answer. Ask an expert.",
  retry: "Retry",
  yourQuestion: "Your question",
  ask: "Ask",
  asking: "Asking…",
  newConversation: "New conversation",
  speechUnsupported: "This browser cannot read answers aloud. Please read the answer on screen.",
  starterTitle: "Try asking",
  starters: [
    "Why are my wheat leaves turning yellow?",
    "Is it okay to spray today?",
    "Is any disease spreading near me?",
    "Which farms do I have?",
    "How much did I spend this month?",
    "Do I have any new warnings?",
  ],
  voiceTitle: "Ask by voice",
  voiceHint:
    "Speak your question in Urdu or English. Audio is sent to the configured speech provider only after your consent. Always check the transcript.",
  consentLabel:
    "I consent to sending this recording to the configured speech provider for transcription. I can edit the transcript before using it.",
  checkingVoice: "Checking secure voice availability…",
  voiceUnavailable: "Voice service is unavailable. You can still type your question.",
  consentNeeded: "Ready to record after consent.",
  consentOnFile: "Consent on file. Ready to record.",
  consentRecorded: "Consent recorded. Ready to record.",
  consentRevoked: "Voice-processing consent revoked.",
  consentFailed: "Voice consent could not be updated.",
  startRecording: "Start recording",
  stopRecording: "Stop recording",
  recordAgain: "Record again",
  maxTime: (seconds) => `Up to ${seconds} seconds`,
  stateIdle: "Tap the microphone and speak",
  stateRequesting: "Waiting for microphone permission…",
  stateRecording: "Listening… tap to stop",
  statePreparing: "Preparing audio…",
  stateUploading: "Uploading securely…",
  stateTranscribing: "Listening to your recording…",
  stateThinking: "Thinking…",
  stateSpeaking: "Speaking the answer",
  stateReview: "Check your question",
  stateError: "Something went wrong",
  errDenied:
    "Microphone permission was denied. Allow the microphone in your browser settings, or type your question.",
  errNoMic: "No microphone was found on this device. You can type your question.",
  errUnsupported: "This browser cannot record audio. You can still type your question.",
  errGeneric: "That did not work. Please try again or type your question.",
  errEmpty: "No audio was recorded. Please try again.",
  errFormat: "This browser does not support an accepted recording format.",
  transcriptLabel: "Your question (edit if needed)",
  transcriptPlaceholder: "Your transcript will appear here. You can edit it.",
  autoSending: "Sending automatically… edit to cancel",
  autoSendOff: "Automatic send cancelled. Press Send when ready.",
  sendNow: "Send now",
  playTranscript: "Play transcript",
  transcriptWarning:
    "Transcription can contain mistakes, especially with crop names, accents and noise. No diagnosis or farm action is generated here.",
  levelMeter: "Live microphone level",
  elapsed: (seconds, max) => `${formatClock(seconds)} / ${formatClock(max)}`,
  assistantUnavailable: "The assistant is unavailable right now.",
  conversationNotStarted: "The conversation could not be started.",
  replyNotUnderstood: "The assistant reply was not understood. Nothing was assumed.",
};

const ur: UiStrings = {
  langToggleLabel: "زبان",
  langUr: "اردو",
  langEn: "English",
  title: "زرعی اسسٹنٹ سے پوچھیں",
  intro:
    "کھیتی باڑی کے جوابات صرف منظور شدہ رہنمائی سے دیے جاتے ہیں اور ساتھ ماخذ بھی بتایا جاتا ہے۔ اگر کوئی رہنمائی نہ ملے تو اسسٹنٹ اندازہ نہیں لگاتا بلکہ صاف بتا دیتا ہے۔ آپ کے اپنے فارم، کھیت، فصل کے موسم، تصدیق شدہ اخراجات اور اطلاعات کے سوالوں کے جواب آپ کے اکاؤنٹ سے دیے جاتے ہیں اور ان پر “آپ کے اکاؤنٹ سے” کا نشان ہوتا ہے۔ اسسٹنٹ صرف آپ کا ڈیٹا پڑھتا ہے، اسے بدلتا نہیں۔ یہ زرعی ماہر کا متبادل نہیں ہے۔",
  farm: "فارم",
  noFarm: "کوئی فارم منتخب نہیں",
  warningsTitle: "آپ کے لیے وارننگز",
  dismiss: "بند کریں",
  dismissAria: "وارننگز بند کریں",
  noWarnings: "آپ کی کوئی نہ پڑھی ہوئی وارننگ نہیں ہے۔",
  unreadWarnings: (n, categories) =>
    `${n} نہ پڑھی ہوئی وارننگز${categories ? ` (${categories})` : ""}`,
  readWarnings: "میری وارننگز سنائیں",
  stop: "روکیں",
  loadingConversation: "گفتگو لوڈ ہو رہی ہے…",
  historyUnavailable: (message) => `گفتگو کی تاریخ دستیاب نہیں: ${message}`,
  sessionEnded: "آپ کا سیشن ختم ہو گیا ہے۔ اسسٹنٹ استعمال کرنے کے لیے دوبارہ لاگ اِن کریں۔",
  noQuestions: "ابھی کوئی سوال نہیں۔ مائیک دبائیں یا نیچے سے کوئی سوال چنیں۔",
  you: "آپ",
  assistant: "اسسٹنٹ",
  fromAccount: "آپ کے اکاؤنٹ سے",
  sources: "ماخذ",
  revision: "ترمیم",
  listen: "سنیں",
  abstained: "کوئی منظور شدہ رہنمائی نہیں ملی، یہ جواب نہیں ہے۔ کسی ماہر سے پوچھیں۔",
  retry: "دوبارہ کوشش کریں",
  yourQuestion: "آپ کا سوال",
  ask: "پوچھیں",
  asking: "پوچھا جا رہا ہے…",
  newConversation: "نئی گفتگو",
  speechUnsupported: "یہ براؤزر جواب پڑھ کر نہیں سنا سکتا۔ براہِ کرم جواب سکرین پر پڑھ لیں۔",
  starterTitle: "یہ پوچھ کر دیکھیں",
  starters: [
    "میری گندم کے پتے پیلے کیوں ہو رہے ہیں؟",
    "کیا آج سپرے کرنا ٹھیک ہے؟",
    "میرے قریب کوئی بیماری پھیل رہی ہے؟",
    "میرے کون سے فارم ہیں؟",
    "اس مہینے میرے کتنے اخراجات ہوئے؟",
    "کیا میرے لیے کوئی نئی وارننگ ہے؟",
  ],
  voiceTitle: "بول کر پوچھیں",
  voiceHint:
    "اردو یا انگریزی میں اپنا سوال بولیں۔ آپ کی اجازت کے بعد ہی آواز تحریر بنانے والی سروس کو بھیجی جاتی ہے۔ تحریر ضرور دیکھ لیں۔",
  consentLabel:
    "میں اس ریکارڈنگ کو تحریر بنانے کے لیے مقررہ سروس کو بھیجنے کی اجازت دیتا/دیتی ہوں۔ استعمال سے پہلے میں تحریر درست کر سکتا/سکتی ہوں۔",
  checkingVoice: "آواز کی محفوظ سہولت دیکھی جا رہی ہے…",
  voiceUnavailable: "آواز کی سہولت ابھی دستیاب نہیں۔ آپ اپنا سوال لکھ سکتے ہیں۔",
  consentNeeded: "اجازت دینے کے بعد ریکارڈنگ ہو سکے گی۔",
  consentOnFile: "اجازت موجود ہے۔ ریکارڈنگ کے لیے تیار۔",
  consentRecorded: "اجازت درج ہو گئی۔ ریکارڈنگ کے لیے تیار۔",
  consentRevoked: "آواز کی پراسیسنگ کی اجازت واپس لے لی گئی۔",
  consentFailed: "آواز کی اجازت تبدیل نہیں ہو سکی۔",
  startRecording: "ریکارڈنگ شروع کریں",
  stopRecording: "ریکارڈنگ روکیں",
  recordAgain: "دوبارہ ریکارڈ کریں",
  maxTime: (seconds) => `زیادہ سے زیادہ ${seconds} سیکنڈ`,
  stateIdle: "مائیک دبائیں اور بولیں",
  stateRequesting: "مائیک کی اجازت کا انتظار ہے…",
  stateRecording: "سن رہا ہوں… روکنے کے لیے دبائیں",
  statePreparing: "آڈیو تیار ہو رہی ہے…",
  stateUploading: "محفوظ طریقے سے بھیجا جا رہا ہے…",
  stateTranscribing: "سن رہا ہوں…",
  stateThinking: "سوچ رہا ہوں…",
  stateSpeaking: "جواب سنایا جا رہا ہے",
  stateReview: "اپنا سوال دیکھ لیں",
  stateError: "کچھ گڑبڑ ہو گئی",
  errDenied:
    "مائیک کی اجازت نہیں ملی۔ براؤزر کی سیٹنگ میں مائیک کی اجازت دیں، یا اپنا سوال لکھیں۔",
  errNoMic: "اس ڈیوائس پر مائیک نہیں ملا۔ آپ اپنا سوال لکھ سکتے ہیں۔",
  errUnsupported: "یہ براؤزر آواز ریکارڈ نہیں کر سکتا۔ آپ اپنا سوال لکھ سکتے ہیں۔",
  errGeneric: "بات نہیں بنی۔ دوبارہ کوشش کریں یا اپنا سوال لکھیں۔",
  errEmpty: "کوئی آواز ریکارڈ نہیں ہوئی۔ دوبارہ کوشش کریں۔",
  errFormat: "یہ براؤزر قابلِ قبول ریکارڈنگ فارمیٹ استعمال نہیں کرتا۔",
  transcriptLabel: "آپ کا سوال (ضرورت ہو تو درست کریں)",
  transcriptPlaceholder: "آپ کی بات کی تحریر یہاں آئے گی۔ آپ اسے درست کر سکتے ہیں۔",
  autoSending: "خود بخود بھیجا جا رہا ہے… روکنے کے لیے تحریر درست کریں",
  autoSendOff: "خود بخود بھیجنا بند ہو گیا۔ تیار ہوں تو بھیجیں دبائیں۔",
  sendNow: "ابھی بھیجیں",
  playTranscript: "تحریر سنیں",
  transcriptWarning:
    "تحریر میں غلطیاں ہو سکتی ہیں، خاص طور پر فصلوں کے نام، لہجے اور شور کی وجہ سے۔ یہاں کوئی تشخیص یا کھیت کا عمل نہیں کیا جاتا۔",
  levelMeter: "مائیک کی آواز کی لہر",
  elapsed: (seconds, max) => `${formatClock(seconds)} / ${formatClock(max)}`,
  assistantUnavailable: "اسسٹنٹ ابھی دستیاب نہیں۔",
  conversationNotStarted: "گفتگو شروع نہیں ہو سکی۔",
  replyNotUnderstood: "اسسٹنٹ کا جواب سمجھ نہیں آیا۔ کوئی اندازہ نہیں لگایا گیا۔",
};

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export const STRINGS: Record<UiLang, UiStrings> = { en, ur };
