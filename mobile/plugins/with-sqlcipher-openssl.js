// Packages the SQLCipher OpenSSL runtime that expo-sqlite needs (see plugins/sqlcipher-openssl.gradle).
const { withAppBuildGradle } = require("expo/config-plugins");
const APPLY = 'apply from: "../../plugins/sqlcipher-openssl.gradle"';
module.exports = (config) =>
  withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes("sqlcipher-openssl.gradle")) {
      cfg.modResults.contents += `\n${APPLY}\n`;
    }
    return cfg;
  });
