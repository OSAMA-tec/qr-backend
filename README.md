# MR Introduction Backend

## Business Phone Number Verification

This application supports businesses registering and verifying their own phone numbers for SMS sending. This allows businesses to use their own identity when communicating with their customers.

### Twilio Configuration for Business Phone Numbers

To enable business phone number verification, add the following to your `.env` file:

```
# Required Twilio credentials
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_MESSAGING_SERVICE_SID=MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# For business phone verification
TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Optional but recommended to avoid "30038 OTP Message Body Filtered" errors
TWILIO_VERIFY_TEMPLATE_SID=HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Troubleshooting: 30038 OTP Message Body Filtered

If you encounter the "30038 OTP Message Body Filtered" error when verifying business phone numbers, this means carrier regulations are filtering Twilio's verification messages.

To resolve this, you have two options:

1. **Create a Custom Verification Template in Twilio (Recommended)**
   - Go to your Twilio Console > Verify > Services > Your Service > Templates
   - Create a new template or select an existing one
   - The template should comply with carrier requirements (avoid marketing language)
   - Example: "Your verification code is: {{code}}. Valid for {{expiration_time}} minutes."
   - Copy the template SID (starts with "HX") and set it as `TWILIO_VERIFY_TEMPLATE_SID` in your .env file
   
   Note: Templates must be approved by Twilio before they can be used.

2. **Automatic Fallback Method (Already Implemented)**
   - Our system includes an automatic fallback that kicks in when message filtering occurs
   - If the Twilio Verify API returns error 30038, we generate our own verification code
   - This code is sent via regular SMS using your Messaging Service
   - No additional configuration is required as long as `TWILIO_MESSAGING_SERVICE_SID` is set

### API Endpoints for Business Phone Numbers

#### Register a Phone Number
```
POST /api/sms/business-numbers/register
{
  "phoneNumber": "+1234567890",
  "makeDefault": true
}
```

#### Start Verification
```
POST /api/sms/business-numbers/:phoneNumberId/verify
```

#### Complete Verification
```
POST /api/sms/business-numbers/verify-code
{
  "phoneNumberId": "123456789012345678901234",
  "verificationCode": "123456"
}
```

#### List Business Phone Numbers
```
GET /api/sms/business-numbers
```

#### Set Default Phone Number
```
POST /api/sms/business-numbers/:phoneNumberId/set-default
```

#### Delete Business Phone Number
```
DELETE /api/sms/business-numbers/:phoneNumberId
```

### Using Business Phone Numbers for SMS

To send SMS using a verified business phone number, include the `fromNumber` parameter:

```
POST /api/sms/send
{
  "to": "+1234567890",
  "message": "Hello, this is a test SMS!",
  "fromNumber": "+1987654321",
  "options": {
    "type": "marketing",
    "campaignId": "optional_campaign_id",
    "campaignName": "Test Campaign"
  }
}
```

If no `fromNumber` is specified, the system will use the business's default verified number or fall back to the Twilio Messaging Service.

## Important Note About Receiving OTP Messages on Twilio Numbers

### Error 30038: Inbound OTP Messages Filtered

Twilio blocks the reception of One-Time Passcode (OTP) messages sent to Twilio numbers. If you're encountering error 30038 with the message "Twilio has determined that the body of this message contains a One-Time Passcode (OTP)", this is a deliberate security measure by Twilio.

### Why This Happens

Twilio blocks inbound OTP messages to prevent account abuse and fraud. This is different from the 30038 error that can occur when sending verification codes.

### Solutions

1. **Do Not Use Twilio Numbers to Receive OTPs**
   - Twilio numbers should not be used to register for services that send OTP verification codes
   - Use a non-Twilio phone number for receiving verification codes from third-party services

2. **Contact Twilio Support**
   - If you have a legitimate business need to receive OTP messages, you must contact Twilio Support
   - Visit: https://support.twilio.com/ 
   - Explain your specific use case and request an exception

3. **For Development Testing**
   - When testing your application, use non-Twilio numbers to test receiving OTPs
   - Most services won't send OTPs to Twilio numbers anyway due to fraud prevention

There is no codebase workaround for this limitation, as it's enforced by Twilio at the platform level to prevent fraud.
