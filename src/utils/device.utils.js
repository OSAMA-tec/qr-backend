// Device detection utilities 📱

/**
 * Detect device type from user agent 
 * @param {string} userAgent - Browser user agent string
 * @returns {Object} Device info
 */
const detectDevice = (userAgent) => {
  const ua = userAgent.toLowerCase();
  
  // Device type detection
  let type = 'desktop';
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    type = 'tablet';
  } else if (
    /Mobile|iP(hone|od)|Android|BlackBerry|IEMobile|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(
      userAgent
    )
  ) {
    type = 'mobile';
  }

  return {
    type,
    isMobile: type === 'mobile',
    isTablet: type === 'tablet',
    isDesktop: type === 'desktop'
  };
};

/**
 * Parse user agent for browser and OS info
 * @param {string} userAgent - Browser user agent string
 * @returns {Object} Browser and OS info
 */
const parseUserAgent = (userAgent) => {
  const ua = userAgent.toLowerCase();
  
  // Browser detection
  let browser = 'unknown';
  if (ua.includes('firefox')) {
    browser = 'firefox';
  } else if (ua.includes('edg')) {
    browser = 'edge';
  } else if (ua.includes('chrome')) {
    browser = 'chrome';
  } else if (ua.includes('safari')) {
    browser = 'safari';
  } else if (ua.includes('opera') || ua.includes('opr')) {
    browser = 'opera';
  }

  // OS detection
  let os = 'unknown';
  if (ua.includes('windows')) {
    os = 'windows';
  } else if (ua.includes('mac os')) {
    os = 'macos';
  } else if (ua.includes('android')) {
    os = 'android';
  } else if (ua.includes('ios')) {
    os = 'ios';
  } else if (ua.includes('linux')) {
    os = 'linux';
  }

  return {
    browser,
    os,
    userAgent: ua
  };
};

module.exports = {
  detectDevice,
  parseUserAgent
}; 