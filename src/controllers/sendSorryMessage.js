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

exports.sendSorryMessage = functions
    .runWith({timeoutSeconds: 540})
    .firestore.document("sorry_message_tempbin/{docId}")
    .onCreate(async (snap, context) => {
      const newValue = snap.data();
      const location = newValue.location;
      console.log("newValue: ", newValue);
      console.log("location: ", location);

      if (location === "leopolds") {
        const groupedRef = db.collection("grouped");
        console.log("Processing the location");
        const groupedSnapshot = await groupedRef.where("location", "==", "/location/2fdMSdtEAAkDTZWjOimY_Madison_Wisconsin").get();

        const docs = groupedSnapshot.docs;
        await processChunks(docs, 0);
      }
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
            await sendSorryMessage(formattedPhoneNumber);
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

async function sendSorryMessage(formattedPhoneNumber) {
  const message = "It came to my understanding recently that Leopolds was closed this morning, which is not typical of them. They were short staffed and could not open in time and left a sign posted on the door, since a few employees were sick. I'm so sorry that happened, this week was a fluke and we are sincerely so sorry! We're working hard to make sure that never happens again! Sincerely, Stuart";

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
