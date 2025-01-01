// Location utilities 🌍

/**
 * Get location info from IP address
 * @param {string} ipAddress - IP address to lookup
 * @returns {Promise<Object>} Location info
 */
const getLocationFromIP = async (ipAddress) => {
  try {
    // Remove any IPv6 prefix if present
    const ip = ipAddress.replace(/^::ffff:/, '');
    
    // For local development IPs, return default location
    if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
      return {
        country: 'Unknown',
        city: 'Unknown',
        region: 'Unknown'
      };
    }

    // Basic location info for now
    // TODO: Integrate with a proper IP geolocation service
    return {
      country: 'Unknown',
      city: 'Unknown',
      region: 'Unknown',
      ip: ip
    };
  } catch (error) {
    console.error('Location detection error:', error);
    return {
      country: 'Unknown',
      city: 'Unknown',
      region: 'Unknown'
    };
  }
};

module.exports = {
  getLocationFromIP
}; 