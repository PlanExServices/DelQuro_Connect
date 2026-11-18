function httpsOrigin(name) {
  try {
    const origin = new URL(process.env[name]);
    if (
      origin.protocol !== 'https:' || origin.pathname !== '/' ||
      origin.username || origin.password || origin.search || origin.hash
    ) {
      throw new Error('Invalid origin');
    }
    return origin.origin;
  } catch {
    throw new Error(`Set ${name} to an approved HTTPS origin for this build.`);
  }
}

module.exports = ({ config }) => {
  if (process.env.CONNECT_REQUIRE_HTTPS === '1') {
    const origin = httpsOrigin('EXPO_PUBLIC_CONNECT_URL');
    if (process.env.EXPO_PUBLIC_CONNECT_REVIEW_URL && httpsOrigin('EXPO_PUBLIC_CONNECT_REVIEW_URL') === origin) {
      throw new Error('The review workspace must use a separate origin.');
    }
  }
  return config;
};
