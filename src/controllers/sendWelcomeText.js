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
          console.log(`${current_city} has already reached 500 users. No welcome text sent.`); // no welcome message at all if the city is already active?
          return;
        }

        // Increment totalUsers
        await cityConfigRef.update({totalUsers: totalUsers + 1});

        const messageBody = `Hey ${display_name}, welcome to the Mesh community! You’re #${totalUsers + 1}/500 in ${city_map[current_city]}.
        
        We invite you to local coffee shops with 3–4 others on Saturdays at 10am, invites go out on Wednesdays. As soon as ${city_map[current_city]} is close to 500 signups, we’ll start those invites. In the meantime, feel free to explore the app and use your referral link (found in your profile) to help reach that goal faster. Cheers, Stuart and Michael (Mesh co-founders).`;
        // tried to shorten up the message, while keeping key information

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

const city_map = {
  albuquerque_nm: "Albuquerque, NM",
  atlanta_ga: "Atlanta, GA",
  austin_tx: "Austin, TX",
  baltimore_md: "Baltimore, MD",
  baton_rouge_la: "Baton Rouge, LA",
  boise_id: "Boise, ID",
  boston_ma: "Boston, MA",
  charleston_sc: "Charleston, SC",
  charlotte_nc: "Charlotte, NC",
  chicago_il: "Chicago, IL",
  cincinnati_oh: "Cincinnati, OH",
  cleveland_oh: "Cleveland, OH",
  dallas_tx: "Dallas, TX",
  denver_co: "Denver, CO",
  des_moines_ia: "Des Moines, IA",
  detroit_mi: "Detroit, MI",
  fort_myers_fl: "Fort Myers, FL",
  honolulu_hi: "Honolulu, HI",
  houston_tx: "Houston, TX",
  indianapolis_in: "Indianapolis, IN",
  kansas_city_mo: "Kansas City, MO",
  las_vegas_nv: "Las Vegas, NV",
  louisville_ky: "Louisville, KY",
  madison_wi: "Madison, WI",
  miami_fl: "Miami, FL",
  milwaukee_wi: "Milwaukee, WI",
  minneapolis_mn: "Minneapolis, MN",
  nashville_tn: "Nashville, TN",
  new_orleans_la: "New Orleans, LA",
  new_york_ny: "New York, NY",
  oklahoma_city_ok: "Oklahoma City, OK",
  omaha_ne: "Omaha, NE",
  other: "Other",
  philadelphia_pa: "Philadelphia, PA",
  phoenix_az: "Phoenix, AZ",
  pittsburgh_pa: "Pittsburgh, PA",
  portland_or: "Portland, OR",
  raleigh_nc: "Raleigh, NC",
  sacramento_ca: "Sacramento, CA",
  saint_louis_mo: "Saint Louis, MO",
  salt_lake_city_ut: "Salt Lake City, UT",
  san_antonio_tx: "San Antonio, TX",
  san_diego_ca: "San Diego, CA",
  san_francisco_ca: "San Francisco, CA",
  san_jose_ca: "San Jose, CA",
  savannah_ga: "Savannah, GA",
  seattle_wa: "Seattle, WA",
  tampa_fl: "Tampa, FL",
  washington_dc: "Washington, DC",
};
