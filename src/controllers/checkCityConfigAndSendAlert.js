const functions = require("firebase-functions");
const admin = require("firebase-admin");
const Twilio = require("twilio");

// Twilio configuration
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
const client = new Twilio(accountSid, authToken);


exports.checkCityConfigAndSendAlert = functions.pubsub
    .schedule("every 24 hours")
    .onRun(async (context) => {
      const db = admin.firestore();
      const cityConfigRef = db.collection("city_config");

      try {
        // Get all documents where isActive is false
        const snapshot = await cityConfigRef.where("isActive", "==", false).get();

        const promises = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data.totalUsers >= 100) {
            const city = data.city || "Unknown City";
            const message = `Alert, ${city} is at ${data.totalUsers} users, check firebase immediately and make sure city_config is configured and locations are added!`;
            promises.push(sendTextAlert(message));
          }
        });

        await Promise.all(promises);

        console.log("Checked city_config collection and sent alerts if necessary.");
        return null;
      } catch (error) {
        console.error("Error checking city_config collection:", error);
        return null;
      }
    });

async function sendTextAlert(message) {
  const phoneNumbers = ["+19896273992", "+16083451606"];
  const promises = phoneNumbers.map((phoneNumber) => {
    return client.messages.create({
      body: message,
      from: twilioPhoneNumber,
      to: phoneNumber,
    })
        .then((message) => {
          console.log("Alert message sent, SID:", message.sid);
        })
        .catch((error) => {
          console.error("Error sending alert message:", error);
        });
  });

  return Promise.all(promises);
}
