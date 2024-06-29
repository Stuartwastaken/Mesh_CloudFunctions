const functions = require("firebase-functions");
const admin = require("firebase-admin");
const Twilio = require("twilio");

// Twilio configuration
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
const client = new Twilio(accountSid, authToken);

// Your test phone number
const testPhoneNumber = "+19896273992";

exports.sendTestSmsInvites = functions.runWith({timeoutSeconds: 540})
    .firestore
    .document("send_sms_invites_tempbin/{docId}")
    .onCreate(async (snap, context) => {
      const data = snap.data();
      const {locationId, userIds} = data;

      if (!locationId || !userIds || !Array.isArray(userIds)) {
        console.error("Invalid data in send_sms_invites_tempbin document");
        return null;
      }

      console.log(`Processing location: ${locationId}, Total users: ${userIds.length}`);

      let sentCount = 0;
      for (const userId of userIds) {
        try {
          const userDoc = await admin.firestore().collection("users").doc(userId).get();
          if (!userDoc.exists) {
            console.warn(`User ${userId} not found`);
            continue;
          }
          const user = userDoc.data();
          const displayName = user.display_name || "there"; // Default to "there" if no display name is available
          const rawPhoneNumber = user.phone_number;

          if (!rawPhoneNumber) {
            console.warn(`Phone number not found for user ${userId}`);
            continue;
          }

          const formattedPhoneNumber = formatPhoneNumber(rawPhoneNumber);
          const textMessage = `Hi ${displayName}, uid: ${userId} click this link to join us for coffee this Saturday at 10am:`;
          const linkMessage = `https://nextjs-mesh-seven.vercel.app/?location=${locationId}&route=invitedConfirm`;

          if (sentCount < 2) { // Limit to 2 test sends to prevent overuse of resources
            await sendTestTextInvite(testPhoneNumber, textMessage, linkMessage, locationId);
            sentCount++;
          } else {
            console.log(`Would send to ${formattedPhoneNumber}: Text - ${textMessage}, Link - ${linkMessage}`);
          }

          await new Promise((resolve) => setTimeout(resolve, 20)); // Throttle requests
        } catch (error) {
          console.error(`Error processing user ${userId}:`, error);
        }
      }

      console.log(`Finished processing all users for location ${locationId}. Sent ${sentCount} test messages.`);
      // await snap.ref.delete(); // Clean up after processing
    });

function formatPhoneNumber(phoneNumber) {
  return phoneNumber.replace(/[^+\d]/g, "");
}

async function sendTestTextInvite(phoneNumber, textMessage, linkMessage, locationId) {
  try {
    // Send the text part
    const textResponse = await client.messages.create({
      body: textMessage,
      from: twilioPhoneNumber,
      to: phoneNumber,
    });
    console.log(`Text message sent for location ${locationId}, SID:`, textResponse.sid);

    // Send the link part as a separate message
    const linkResponse = await client.messages.create({
      body: linkMessage,
      from: twilioPhoneNumber,
      to: phoneNumber,
    });
    console.log(`Link message sent for location ${locationId}, SID:`, linkResponse.sid);
  } catch (error) {
    console.error(`Error sending messages for location ${locationId}:`, error);
    console.error("Error details:", {
      message: error.message,
      response: error.response,
      code: error.code,
      errno: error.errno,
    });
  }
}
