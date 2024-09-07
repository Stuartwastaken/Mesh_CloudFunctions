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

exports.sendWelcomeText = functions.firestore
    .document("signedup_new_city_text_tempbin/{docId}")
    .onCreate(async (snap, context) => {
      const newUser = snap.data();
      const {uid, phone_number, current_city, display_name} = newUser;

      try {
        // Get city config document
        const cityConfigRef = db.collection("city_config").doc(current_city);
        const cityConfigDoc = await cityConfigRef.get();

        if (!cityConfigDoc.exists) {
          console.error(`City config not found for ${current_city}`);
          return;
        }

        const cityConfig = cityConfigDoc.data();
        const totalUsers = cityConfig.totalUsers || 0;

        if (totalUsers >= 500) {
          console.log(`${current_city} has already reached 500 users. No welcome text sent.`);
          return;
        }

        // Increment totalUsers
        await cityConfigRef.update({totalUsers: totalUsers + 1});

        const messageBody = `Hey ${display_name}, welcome to the Mesh community! You’re #${totalUsers + 1}/500 in ${current_city}. We’ll start invites when ${current_city} hits 500.

        We send you invites every Wednesday to local coffee shops Saturday at 10 am in groups of 3 or 4. If you'd like to help us get to 500 sign ups in your city, please share us on social media, and feel free to reach out to us for content ideas or collaborations! We’re accelerating the rate at which people can meet their crowd of people in any city. For now feel free to explore the app and invite your friends with a link found on your profile page! Cheers, Co-Founders, Stuart and Michael.`;

        const formattedPhoneNumber = formatPhoneNumber(phone_number);
        // Send text message
        await client.messages.create({
          body: messageBody,
          from: twilioPhoneNumber,
          to: formattedPhoneNumber,
        });

        console.log(`Welcome text sent to ${display_name} (${phone_number}) in ${current_city}`);

        // Delete the document from the tempbin
        await snap.ref.delete();
      } catch (error) {
        console.error("Error sending welcome text:", error);
      }
    });

function formatPhoneNumber(phoneNumber) {
  return phoneNumber.replace(/[^+\d]/g, "");
}
