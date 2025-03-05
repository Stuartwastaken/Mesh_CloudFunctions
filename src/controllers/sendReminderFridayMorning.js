const functions = require("firebase-functions");
const admin = require("firebase-admin");
const Twilio = require("twilio");

// Twilio configuration
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
const client = new Twilio(accountSid, authToken);

// This function is triggered when a document is created in join_lobby_tempbin
exports.sendMeshInvites = functions
    .runWith({timeoutSeconds: 540})
    .firestore.document("join_lobby_tempbin/{docId}")
    .onCreate(async (snap, context) => {
      const data = snap.data();
      const {userIds, locationId} = data;

      if (!locationId || !userIds || !Array.isArray(userIds)) {
        console.error("Invalid data in join_lobby_tempbin document");
        return null;
      }

      // For demonstration purposes, assume you get the coffee shop name from locationId.
      // Replace this with your actual lookup logic.
      const coffeeShopName = "Your Coffee Shop";

      // Process each user reference in the join_lobby_tempbin document
      for (const userRef of userIds) {
        try {
        // Lookup user document from /users/{uid}
          const userDoc = await admin.firestore().collection("users").doc(userRef).get();
          if (!userDoc.exists) {
            console.warn(`User ${userRef} not found`);
            continue;
          }
          const user = userDoc.data();
          const displayName = user.display_name || "there";

          // Build the invite message
          const messageContent = `Hi ${displayName}! Thanks for choosing Mesh this weekend. Your meetup is set for tomorrow at 10am at ${coffeeShopName}. If you need to cancel, please do so by 5pm tonight. Enjoy your meetup!`;

          // If user prefers SMS and has a phone number, send an SMS invite
          if (user.notification_preference_is_sms && user.phone_number) {
            const formattedPhoneNumber = formatPhoneNumber(user.phone_number);
            await sendTextInvite(formattedPhoneNumber, messageContent);
          } else {
          // Otherwise send a push notification using your notifyUser logic
            const pushMessage = {
              title: "Your Mesh meetup is confirmed!",
              body: messageContent,
            };
            await notifyUser(userRef, pushMessage);
          }
        } catch (error) {
          console.error(`Error processing user ${userRef}:`, error);
        }
      }
    });

// Utility function to format phone numbers (removing spaces, dashes, etc.)
function formatPhoneNumber(phoneNumber) {
  return phoneNumber.replace(/[^+\d]/g, "");
}

// Function to send an SMS invite via Twilio
async function sendTextInvite(formattedPhoneNumber, messageContent) {
  try {
    const textResponse = await client.messages.create({
      body: messageContent,
      from: twilioPhoneNumber,
      to: formattedPhoneNumber,
    });
    console.log("Text message sent, SID:", textResponse.sid);
  } catch (error) {
    console.error("Error sending text message:", error);
  }
}

// Function to send a push notification (using your notifyUser logic)
async function notifyUser(userId, pushMessage) {
  const fcmTokensSnapshot = await admin.firestore()
      .collection("users")
      .doc(userId)
      .collection("fcm_tokens")
      .get();

  for (const doc of fcmTokensSnapshot.docs) {
    const tokenData = doc.data();
    if (tokenData && tokenData.fcm_token) {
      const payload = {
        notification: {
          title: pushMessage.title,
          body: pushMessage.body,
        },
        token: tokenData.fcm_token,
      };
      try {
        await admin.messaging().send(payload);
      } catch (error) {
        console.error(`Error sending notification to token ${tokenData.fcm_token}:`, error.message);
      }
    }
  }
}
