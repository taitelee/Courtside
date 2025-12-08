const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.server = {
  ...config.server,
  rewriteRequestUrl: (url) => {
    if (url.startsWith('/api/')) {
      return url.replace('/api/', 'http://localhost:8080/');
    }
    return url;
  },
};

config.resolver = {
  ...config.resolver,
  alias: {
    ...config.resolver.alias,
    fontfaceobserver: require.resolve('fontfaceobserver'),
  },
};

module.exports = config;