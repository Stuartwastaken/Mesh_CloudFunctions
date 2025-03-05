const functions = require("firebase-functions");
const admin = require("firebase-admin");
const Twilio = require("twilio");

// Twilio configuration
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
const client = new Twilio(accountSid, authToken);

exports.sendSmsInvites = functions
    .runWith({timeoutSeconds: 540})
    .firestore.document("send_sms_invites_tempbin/{docId}")
    .onCreate(async (snap, context) => {
      const data = snap.data();
      const {locationId, userIds} = data;

      if (!locationId || !userIds || !Array.isArray(userIds)) {
        console.error("Invalid data in send_sms_invites_tempbin document");
        return null;
      }

      const CHUNK_SIZE = 10; // Define CHUNK_SIZE for slicing user batches
      await processUserChunks(userIds, 0, locationId, CHUNK_SIZE);

      // Delete the document after processing
      await snap.ref.delete();
    });

async function processUserChunks(userIds, start, locationId, CHUNK_SIZE) {
  const chunk = userIds.slice(start, start + CHUNK_SIZE);
  for (const userId of chunk) {
    try {
      const userDoc = await admin
          .firestore()
          .collection("users")
          .doc(userId)
          .get();
      if (!userDoc.exists) {
        console.warn(`User ${userId} not found`);
        continue;
      }
      const user = userDoc.data();
      const rawPhoneNumber = user.phone_number;
      const displayName = user.display_name || "there"; // Fallback to "there" if no display name is available
      const deviceType = user.device_type || false;

      if (!rawPhoneNumber) {
        console.warn(`Phone number not found for user ${userId}`);
        continue;
      }

      const formattedPhoneNumber = formatPhoneNumber(rawPhoneNumber);
      const textMessage = `Hey ${displayName}, your Saturday coffee meetup is here! Open the app to accept or decline your spot.`;
      const linkMessage =
        deviceType === "IOS" ?
          "mesh://meshapp.us/invitedConfirm" :
          `https://nextjs-mesh-seven.vercel.app/?location=${locationId}&route=invitedConfirm`;

      console.log("Sending to: ", formattedPhoneNumber);
      await sendTextInvite(formattedPhoneNumber, textMessage, linkMessage);
      await new Promise((resolve) => setTimeout(resolve, 20)); // Throttle requests
    } catch (error) {
      console.error(`Error processing user ${userId}:`, error);
    }
  }

  const nextStart = start + CHUNK_SIZE;
  if (nextStart < userIds.length) {
    await processUserChunks(userIds, nextStart, locationId, CHUNK_SIZE); // Recursively process the next chunk
  } else {
    console.log(`Finished processing all users for location ${locationId}`);
  }
}

function formatPhoneNumber(phoneNumber) {
  return phoneNumber.replace(/[^+\d]/g, "");
}

async function sendTextInvite(formattedPhoneNumber, textMessage, linkMessage) {
  try {
    // Send the text part
    const textResponse = await client.messages.create({
      body: textMessage,
      from: twilioPhoneNumber,
      to: formattedPhoneNumber,
    });
    console.log("Text message sent, SID:", textResponse.sid);

    // Send the link part as a separate message
    const linkResponse = await client.messages.create({
      body: linkMessage,
      from: twilioPhoneNumber,
      to: formattedPhoneNumber,
    });
    console.log("Link message sent, SID:", linkResponse.sid);
  } catch (error) {
    console.error("Error sending text messages:", error);
    console.error("Error details:", {
      message: error.message,
      response: error.response,
      code: error.code,
      errno: error.errno,
    });
  }
}
