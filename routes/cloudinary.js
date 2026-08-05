const express = require('express');
const router = express.Router();
const { cloudinary } = require('../cloudConfig.js');

router.get('/sign', (req, res) => {
  const timestamp = Math.round(Date.now() / 1000);
  const folder = 'wanderlust_DEV';
  const signature = cloudinary.utils.api_sign_request({ timestamp, folder }, process.env.CLOUD_API_SECRET);
  return res.json({
    signature,
    timestamp,
    apiKey: process.env.CLOUD_API_KEY,
    cloudName: process.env.CLOUD_NAME,
    folder,
  });
});

module.exports = router;
