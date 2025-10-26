const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add proxy configuration for API requests
config.server = {
  ...config.server,
  rewriteRequestUrl: (url) => {
    // Proxy API requests to local server
    if (url.startsWith('/api/')) {
      return url.replace('/api/', 'http://localhost:8080/');
    }
    return url;
  }
};

// Ensure proper module resolution and exclude server files
config.resolver = {
  ...config.resolver,
  alias: {
    ...config.resolver.alias,
  },
  blockList: [
    /server\/.*/,
  ],
};

module.exports = config;
