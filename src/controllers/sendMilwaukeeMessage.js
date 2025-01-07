const functions = require("firebase-functions");
const admin = require("firebase-admin");
const twilio = require("twilio");
require("dotenv").config();
const db = admin.firestore();

// Load Twilio credentials from environment variables
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
const client = twilio(accountSid, authToken);

const CHUNK_SIZE = 10; // Number of messages to send in each invocation

exports.sendMilwaukeeMessage = functions
    .runWith({timeoutSeconds: 540})
    .firestore.document("send_milwaukee_message_tempbin/{docId}")
    .onCreate(async (snap, context) => {
    // Grab all users where "current_city" is "milwaukee_wi"
      const userSnapshot = await db
          .collection("users")
          .where("current_city", "==", "milwaukee_wi")
          .get();

      const docs = userSnapshot.docs;
      await processChunks(docs, 0);
    });

async function processChunks(docs, start) {
  const chunk = docs.slice(start, start + CHUNK_SIZE);

  for (const doc of chunk) {
    const rawPhoneNumber = doc.get("phone_number");
    if (rawPhoneNumber) {
      const formattedPhoneNumber = formatPhoneNumber(rawPhoneNumber);
      console.log("Sending to:", formattedPhoneNumber);
      await sendMessage(formattedPhoneNumber);

      // Small delay
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  const nextStart = start + CHUNK_SIZE;
  if (nextStart < docs.length) {
    // Recur for the next batch
    await processChunks(docs, nextStart);
  }
}

function formatPhoneNumber(phoneNumber) {
  return phoneNumber.replace(/[^+\d]/g, "");
}

async function sendMessage(formattedPhoneNumber) {
  const message =
    "Thank you for trying Mesh! We are launching in your city, Milwaukee this week! " +
    "The first invite will be sent on Jan 8th, and the invite will be for Jan 11th at 10am. " +
    "As a token of gratitude here is a free mesh coupon to use! Use code: FREEMESH at the stripe payment portal this weekend!";

  try {
    const response = await client.messages.create({
      body: message,
      from: twilioPhoneNumber,
      to: formattedPhoneNumber,
    });
    console.log("Message sent, SID:", response.sid);
  } catch (error) {
    console.error("Error sending text message:", error);
    console.error("Error details:", {
      message: error.message,
      response: error.response,
      code: error.code,
      errno: error.errno,
    });
  }
}
