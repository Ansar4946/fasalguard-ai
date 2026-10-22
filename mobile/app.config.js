// Extends app.json. Push notifications need a Firebase `google-services.json` for the Android app
// (package pk.fasalguard.mobile). Point EXPO_GOOGLE_SERVICES_FILE at it when building; without it the
// app still builds and reports "no push configuration" instead of pretending push works.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    ...(process.env.EXPO_GOOGLE_SERVICES_FILE
      ? { googleServicesFile: process.env.EXPO_GOOGLE_SERVICES_FILE }
      : {}),
  },
});
