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
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}_${day}_${year}`;
}

exports.remindLobby = functions
    .runWith({timeoutSeconds: 540})
    .firestore.document("remind_lobby_tempbin/{docId}")
    .onCreate(async (snap, context) => {
      const reminderData = snap.data();
      const city = reminderData.city;
      const timeZone = reminderData.timeZone;

      console.log(`Processing reminders for ${city} in ${timeZone}`);

      const nextSaturday = formatDate(getNextSaturday());
      const subcollectionRef = db.collection("lobby").doc(nextSaturday).collection(city);
      const snapshot = await subcollectionRef.get();

      const docs = snapshot.docs;
      await processChunks(docs, 0, city, timeZone);
    });

async function processChunks(docs, start, city, timeZone) {
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
          console.log(`Sending reminder to: ${formattedPhoneNumber} for ${city} in ${timeZone}`);
          await sendTextReminder(formattedPhoneNumber, city);
          await new Promise((resolve) => setTimeout(resolve, 20));
        } else {
          console.log(`No phone number found for user ${userId} in ${city}`);
        }
      } else {
        console.log(`User document not found for ${userId} in ${city}`);
      }
    } else {
      console.log(`No user ID found in lobby document for ${city}`);
    }
  }

  const nextStart = start + CHUNK_SIZE;
  if (nextStart < docs.length) {
    // Invoke the function recursively to handle the next chunk
    await processChunks(docs, nextStart, city, timeZone);
  } else {
    console.log(`Finished processing all reminders for ${city} in ${timeZone}`);
  }
}

function formatPhoneNumber(phoneNumber) {
  return phoneNumber.replace(/[^+\d]/g, "");
}

async function sendTextReminder(formattedPhoneNumber, city) {
  const message =
    `This is a reminder that you are all set to Mesh tomorrow morning in ${city}! ` +
    "Please note that today you can cancel by opening the app and clicking the cancel button. " +
    "We'd really appreciate it if you can't make it, to do that. " +
    "We will then pair you into groups and you can see who you're grouped with on that same screen in the app by 8 am tomorrow morning! ";

  try {
    const response = await client.messages.create({
      body: message,
      from: twilioPhoneNumber,
      to: formattedPhoneNumber,
    });
    console.log(`Message sent to ${formattedPhoneNumber}, SID: ${response.sid}`);
  } catch (error) {
    console.error(`Error sending text message to ${formattedPhoneNumber}:`, error);
    console.error("Error details:", {
      message: error.message,
      response: error.response,
      code: error.code,
      errno: error.errno,
    });
  }
}
