const functions = require("firebase-functions");
const admin = require("firebase-admin");
const Twilio = require("twilio");

// Twilio configuration using environment variables
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
const client = new Twilio(accountSid, authToken);

// Define the cloud function with a 540-second timeout
exports.sendFeedbackRequestsDormantUsers = functions.runWith({timeoutSeconds: 540}).firestore
    .document("trigger_feedback_requests/{docId}")
    .onCreate(async (snap, context) => {
      const data = snap.data();

      // Check if the trigger document has confirm set to true
      if (data.confirm !== true) {
        console.log("Confirmation not set, aborting");
        await snap.ref.delete();
        return;
      }

      // Fetch active cities from city_config collection
      const cityConfigSnapshot = await admin.firestore()
          .collection("city_config")
          .where("isActive", "==", true)
          .get();
      const activeCities = cityConfigSnapshot.docs.map((doc) => doc.get("city"));

      // Get inactive users from active cities
      const users = await getInactiveUsers(activeCities);

      // Process users in chunks of 10
      const CHUNK_SIZE = 10;
      await processUserChunks(users, 0, CHUNK_SIZE);

      // Clean up by deleting the trigger document
      await snap.ref.delete();
    });

/**
 * Fetches inactive users from active cities who have never connected (times_connected == 0)
 * @param {string[]} activeCities - Array of active city names
 * @returns {Promise<Object[]>} Array of user objects with id, phone_number, and display_name
 */
async function getInactiveUsers(activeCities) {
  const chunkSize = 10;
  const users = [];

  // Process cities in chunks due to Firestore "in" query limit of 10
  for (let i = 0; i < activeCities.length; i += chunkSize) {
    const chunk = activeCities.slice(i, i + chunkSize);
    const snapshot = await admin.firestore()
        .collection("users")
        .where("current_city", "in", chunk)
        .where("times_connected", "==", 0)
        .select("phone_number", "display_name")
        .get();

    snapshot.docs.forEach((doc) => {
      users.push({
        id: doc.id,
        phone_number: doc.get("phone_number"),
        display_name: doc.get("display_name"),
      });
    });
  }
  return users;
}

/**
 * Processes users in chunks, sending feedback messages with a delay
 * @param {Object[]} users - Array of user objects
 * @param {number} start - Starting index for the current chunk
 * @param {number} CHUNK_SIZE - Size of each chunk
 */
async function processUserChunks(users, start, CHUNK_SIZE) {
  const chunk = users.slice(start, start + CHUNK_SIZE);

  for (const user of chunk) {
    try {
      const rawPhoneNumber = user.phone_number;
      const displayName = user.display_name || "there"; // Default to "there" if no display name

      // Skip if no phone number is found
      if (!rawPhoneNumber) {
        console.warn(`Phone number not found for user ${user.id}`);
        continue;
      }

      const formattedPhoneNumber = formatPhoneNumber(rawPhoneNumber);
      const textMessage = `Hi ${displayName}, we noticed you haven't used Mesh yet. Could you please take 30 seconds to give us feedback on why you're not using the app? Here's the link: https://q38b2a3usyo.typeform.com/to/kmaozGWU`;

      // Send the message and wait briefly to respect Twilio rate limits
      await sendTextMessage(formattedPhoneNumber, textMessage);
      await new Promise((resolve) => setTimeout(resolve, 20)); // 20ms delay
    } catch (error) {
      console.error(`Error processing user ${user.id}:`, error);
    }
  }

  // Recursively process the next chunk if there are more users
  const nextStart = start + CHUNK_SIZE;
  if (nextStart < users.length) {
    await processUserChunks(users, nextStart, CHUNK_SIZE);
  }
}

/**
 * Sends an SMS message using Twilio
 * @param {string} formattedPhoneNumber - The recipient's phone number
 * @param {string} textMessage - The message to send
 */
async function sendTextMessage(formattedPhoneNumber, textMessage) {
  try {
    const response = await client.messages.create({
      body: textMessage,
      from: twilioPhoneNumber,
      to: formattedPhoneNumber,
    });
    console.log("Text message sent, SID:", response.sid);
  } catch (error) {
    console.error("Error sending text message:", error);
  }
}

/**
 * Formats a phone number by removing all non-digit characters except the plus sign
 * @param {string} phoneNumber - The raw phone number
 * @returns {string} The formatted phone number
 */
function formatPhoneNumber(phoneNumber) {
  return phoneNumber.replace(/[^+\d]/g, "");
}
