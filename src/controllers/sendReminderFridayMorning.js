const functions = require("firebase-functions");
const admin = require("firebase-admin");
const Twilio = require("twilio");

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
const client = new Twilio(accountSid, authToken);

/**
 * Scheduled Cloud Function running every Friday at 10am.
 * It processes all pending invites in the join_lobby_tempbin collection.
 */
exports.sendMeshInvites = functions.pubsub
    .schedule("0 10 * * FRI")
    .timeZone("America/Chicago")
    .onRun(async (context) => {
      const db = admin.firestore();
      const invitesSnapshot = await db.collection("join_lobby_tempbin").get();

      if (invitesSnapshot.empty) {
        console.log("No pending invites to process.");
        return null;
      }

      // Process each invite document in join_lobby_tempbin
      for (const doc of invitesSnapshot.docs) {
        const data = doc.data();
        const {userIds, location} = data; // location is a DocumentReference

        if (!location || !userIds || !Array.isArray(userIds)) {
          console.error(`Invalid data in join_lobby_tempbin doc: ${doc.id}`);
          continue;
        }

        // Retrieve the coffee shop name from the location document
        let coffeeShopName = "your coffee shop"; // fallback
        try {
          const locationSnap = await location.get();
          if (!locationSnap.exists) {
            console.warn(`Location doc not found for ref: ${location.path}`);
          } else {
            const locationData = locationSnap.data();
            coffeeShopName = locationData?.name || coffeeShopName;
          }
        } catch (err) {
          console.error("Error retrieving location document:", err);
        }

        // Process each user in the invite
        for (const userId of userIds) {
          try {
            const userDoc = await db.collection("users").doc(userId).get();
            if (!userDoc.exists) {
              console.warn(`User ${userId} not found`);
              continue;
            }
            const userData = userDoc.data();
            const displayName = userData.display_name || "there";
            const prefersSms = userData.notification_preference_is_sms;
            const phoneNumber = userData.phone_number;

            // Build the invite message
            const messageContent = `Hi ${displayName}, thanks for choosing Mesh this weekend! Your meetup is set for tomorrow at 10am at ${coffeeShopName}. If you need to cancel, please do so by 5pm tonight. Enjoy your meetup!`;

            // Send SMS if user prefers SMS and has a valid phone number
            if (prefersSms && phoneNumber) {
              const formattedPhoneNumber = formatPhoneNumber(phoneNumber);
              await sendTextInvite(formattedPhoneNumber, messageContent);
            } else {
            // Otherwise, send a push notification
              await sendPushNotification(userId, {
                title: "Your Mesh meetup is confirmed!",
                body: messageContent,
              });
            }
          } catch (error) {
            console.error(`Error processing user ${userId}:`, error);
          }
        }

        // Optionally, delete the processed invite document
        await doc.ref.delete();
      }
      console.log("Processed all pending invites.");
      return null;
    });

/**
 * Helper to format phone numbers (removes spaces, dashes, parentheses, etc.)
 */
function formatPhoneNumber(phoneNumber) {
  return phoneNumber.replace(/[^+\d]/g, "");
}

/**
 * Send an SMS invite via Twilio.
 */
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

/**
 * Send a push notification by collecting the user’s FCM tokens and using sendEachForMulticast.
 */
async function sendPushNotification(userId, pushMessage) {
  try {
    const userDocRef = admin.firestore().collection("users").doc(userId);
    const tokensSnapshot = await userDocRef.collection("fcm_tokens").get();
    const tokens = [];

    tokensSnapshot.forEach((doc) => {
      const tokenData = doc.data();
      if (tokenData.fcm_token) {
        tokens.push(tokenData.fcm_token);
      }
    });

    if (tokens.length === 0) {
      console.log(`No FCM tokens found for user ${userId}`);
      return;
    }

    const message = {
      notification: {
        title: pushMessage.title,
        body: pushMessage.body,
      },
      tokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`Push notification sent to user ${userId}: ${response.successCount} successes.`);
  } catch (error) {
    console.error(`Error sending push notification to user ${userId}:`, error);
  }
}
