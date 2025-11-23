// Configuration helper - loads environment-specific config

const configs = {
  'dev': {
    baseUrl: 'https://api-dev.sportdeets.com',
    description: 'Development environment'
  },
  'prod-internal': {
    baseUrl: 'https://api-int.sportdeets.com',
    description: 'Production cluster - internal (direct to cluster, no APIM rate limits)'
  },
  'prod-external': {
    baseUrl: 'https://api.sportdeets.com',
    description: 'Production - external (through APIM, rate limited to 5000 req/min)'
  }
};

export function getConfig() {
  const env = __ENV.ENVIRONMENT || 'prod-internal';
  
  const config = configs[env];
  if (!config) {
    throw new Error(`Unknown environment: ${env}. Available: ${Object.keys(configs).join(', ')}`);
  }
  
  return config;
}
