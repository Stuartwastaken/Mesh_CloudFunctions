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

// Function to get the next Saturday
function getNextSaturday() {
  const today = new Date();
  return new Date(today.setDate(today.getDate() + ((6 - today.getDay() + 7) % 7)));
}

// Function to format the date as "MM_DD_YYYY"
function formatDate(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}_${day}_${year}`;
}

exports.remindLobby = functions
    .runWith({timeoutSeconds: 540})
    .firestore.document("remind_lobby_tempbin/{docId}")
    .onWrite(async (change, context) => {
      const nextSaturday = formatDate(getNextSaturday());
      const subcollectionRef = db.collection("lobby").doc(nextSaturday).collection("madison_wi");
      const snapshot = await subcollectionRef.get();

      const docs = snapshot.docs;
      await processChunks(docs, 0);
    });

async function processChunks(docs, start) {
  const chunk = docs.slice(start, start + CHUNK_SIZE);
  for (const doc of chunk) {
    const userId = doc.get("uid");
    if (userId) {
      const userRef = db.collection("users").doc(userId);
      const userDoc = await userRef.get();
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
    "This is a reminder that you are all set to Mesh tomorrow morning! " +
    "Please note that today you can cancel by opening the app and clicking the cancel button. " +
    "We'd really appreciate it if you can't make it, to do that. " +
    "We will then pair you into groups and you can see who you're grouped with on that same screen in the app by 8 am tomorrow morning! ";

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
