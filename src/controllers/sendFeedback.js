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

exports.sendFeedback = functions
    .runWith({timeoutSeconds: 540})
    .firestore.document("send_feedback_tempbin/{docId}")
    .onCreate(async (snap, context) => {
      const newValue = snap.data();
      const groupedRef = db.collection("grouped");
      const groupedSnapshot = await groupedRef.get();

      const docs = groupedSnapshot.docs;
      await processChunks(docs, 0);
    });

async function processChunks(docs, start) {
  const chunk = docs.slice(start, start + CHUNK_SIZE);
  for (const doc of chunk) {
    const members = doc.get("members");
    if (members && Array.isArray(members)) {
      for (const memberRef of members) {
        const userDoc = await memberRef.get();
        if (userDoc.exists) {
          const rawPhoneNumber = userDoc.get("phone_number");
          if (rawPhoneNumber) {
            const formattedPhoneNumber = formatPhoneNumber(rawPhoneNumber);
            console.log("Sending to: ", formattedPhoneNumber);
            await sendTextReminder(formattedPhoneNumber);
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
        }
      }
    }
  }

  const nextStart = start + CHUNK_SIZE;
  if (nextStart < docs.length) {
    // Invoke the function recursively to handle the next chunk
    await processChunks(docs, nextStart);
  }
}

function formatPhoneNumber(phoneNumber) {
  return phoneNumber.replace(/[^+\d]/g, "");
}

async function sendTextReminder(formattedPhoneNumber) {
  const message =
    `Thank you for being a part of Mesh! We really value your feedback as we grow.
     You're one of our first 1000 users and your feedback is vital for us to know how we're doing and what to improve. 
     If you have 1 - 3 minutes to visit this link and give us feedback we'd really appreciate it! 
    : https://q38b2a3usyo.typeform.com/to/gOydgyPk`;

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
