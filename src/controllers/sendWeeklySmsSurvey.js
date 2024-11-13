const functions = require("firebase-functions");
const admin = require("firebase-admin");
const Twilio = require("twilio");


// Twilio configuration
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
const client = new Twilio(accountSid, authToken);

// Survey link
const surveyLink = "https://q38b2a3usyo.typeform.com/to/fuSDh8Z5";
const linkMessage = "https://www.eventbrite.com/e/mesh-community-event-tickets-1039072272137";

exports.sendWeeklySurveySms = functions.pubsub.schedule("0 17 * * 2")
    .timeZone("America/Chicago")
    .onRun(async (context) => {
      console.log("Sending out invite to mesh event");

      try {
        const usersSnapshot = await admin.firestore()
            .collection("users")
            .where("current_city", "==", "madison_wi")
            .get();

        const userChunks = chunkArray(usersSnapshot.docs, 10);

        for (const chunk of userChunks) {
          await Promise.all(chunk.map(async (userDoc) => {
            const userData = userDoc.data();
            const rawPhoneNumber = userData.phone_number;

            if (!rawPhoneNumber) {
              console.warn(`Phone number not found for user ${userDoc.id}`);
              return;
            }

            const formattedPhoneNumber = formatPhoneNumber(rawPhoneNumber);
            const message = `Join us for a Mesh outing! All ages are welcome and we encourage you to join us, provide feedback good or bad. Consider this a town hall meeting and get together sponsored by Mesh. RSVP here: ${linkMessage}`;

            await sendSms(formattedPhoneNumber, message);
          }));

          // Add a small delay between chunks to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        console.log("Finished sending weekly survey SMS");
        return null;
      } catch (error) {
        console.error("Error in sendWeeklySurveySms:", error);
        throw error;
      }
    });

function formatPhoneNumber(phoneNumber) {
  return phoneNumber.replace(/[^+\d]/g, "");
}

async function sendSms(to, body) {
  try {
    const message = await client.messages.create({
      body: body,
      from: twilioPhoneNumber,
      to: to,
    });
    console.log(`SMS sent to ${to}, SID: ${message.sid}`);
  } catch (error) {
    console.error(`Error sending SMS to ${to}:`, error);
  }
}

function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}
