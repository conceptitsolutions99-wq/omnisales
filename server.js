require('dotenv').config();
const express = require('express');
const path = require('path');
const twilio = require('twilio');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend build
app.use(express.static(path.join(__dirname, 'dist')));

// Twilio Credentials from environment or config
const accountSid = process.env.TWILIO_ACCOUNT_SID || 'AC_placeholder_sid';
const authToken = process.env.TWILIO_AUTH_TOKEN || 'placeholder_token';
const twilioNumber = process.env.TWILIO_PHONE_NUMBER || '+15550000000';
const twiMLAppSid = process.env.TWILIO_TWIML_APP_SID || 'AP_placeholder_app_sid';

// API: Generate Twilio Access Token for Browser WebRTC Softphone
app.get('/api/token', (req, res) => {
  const identity = req.query.identity || 'sales_agent';

  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  // Create an access token which we will sign and return to the client
  const accessToken = new AccessToken(accountSid, authToken, process.env.TWILIO_API_KEY || '', {
    identity: identity
  });

  // Grant the access token Twilio Voice capabilities
  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: twiMLAppSid,
    incomingAllow: true
  });

  accessToken.addGrant(voiceGrant);

  res.json({
    token: accessToken.toJwt(),
    identity: identity
  });
});

// API: TwiML Voice Webhook (handles outbound calls to actual phone numbers)
app.post('/api/voice', (req, res) => {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  const toNumber = req.body.To || req.query.To;

  if (toNumber) {
    const dial = twiml.dial({ callerId: twilioNumber });
    dial.number(toNumber);
  } else {
    twiml.say('Thanks for calling OmniSales IT Pro. Connecting your outbound call.');
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// Fallback to SPA index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`OmniSales Server running on port ${PORT}`);
});
