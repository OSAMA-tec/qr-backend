// Import dependencies 📦
const admin = require('firebase-admin');
require('dotenv').config();

// Firebase configuration 🔥
const firebaseConfig = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
};

// Initialize Firebase 🚀
admin.initializeApp({
  credential: admin.credential.cert(firebaseConfig),
  storageBucket: `${process.env.FIREBASE_PROJECT_ID}.appspot.com`
});

// Get bucket reference 🪣
const bucket = admin.storage().bucket();

module.exports = {
  bucket,
  admin
}; 