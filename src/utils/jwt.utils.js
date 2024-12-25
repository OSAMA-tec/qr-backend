// Import dependencies 🔑
const jwt = require('jsonwebtoken');

// Generate tokens 🎟️
const generateTokens = (userId,role) => {
  // Create access token (short-lived) ⚡
  console.log(role)
  const accessToken = jwt.sign(
    { userId,role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '3d' } // Access token expires in 15 minutes
  );

  // Create refresh token (long-lived) 🔄
  const refreshToken = jwt.sign(
    { userId,role },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' } // Refresh token expires in 7 days
  );

  return { accessToken, refreshToken };
};

// Verify access token 🔍
const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  } catch (error) {
    return null;
  }
};

// Verify refresh token 🔄
const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch (error) {
    return null;
  }
};

module.exports = {
  generateTokens,
  verifyAccessToken,
  verifyRefreshToken
}; 