// Configuration helper - loads environment-specific config

import { open } from 'k6';

export function getConfig() {
  const env = __ENV.ENVIRONMENT || 'prod-internal';
  
  let config;
  try {
    // Use path relative to k6 directory (where k6 run is executed)
    const configFile = open(`./config/${env}.json`);
    config = JSON.parse(configFile);
  } catch (e) {
    console.error(`Failed to load config for environment: ${env}`);
    throw e;
  }
  
  return config;
}
