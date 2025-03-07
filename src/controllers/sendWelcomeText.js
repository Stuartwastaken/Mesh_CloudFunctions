const functions = require("firebase-functions");
const admin = require("firebase-admin");
const twilio = require("twilio");

// Initialize Firebase Admin safely
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Load Twilio credentials from Firebase Config
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

// Validate Twilio credentials before creating the client
if (!accountSid || !authToken || !twilioPhoneNumber) {
  functions.logger.error({
    message: "Missing Twilio credentials",
    accountSid: accountSid ? "defined" : "undefined",
    authToken: authToken ? "defined" : "undefined",
    twilioPhoneNumber: twilioPhoneNumber ? "defined" : "undefined",
    timestamp: new Date().toISOString(),
  });
  throw new Error("Twilio credentials are not configured");
}

const client = twilio(accountSid, authToken);

exports.sendWelcomeText = functions.firestore
    .document("signedup_new_city_text_tempbin/{docId}")
    .onCreate(async (snap, context) => {
      const newUser = snap.data();
      const {uid, phone_number, current_city, display_name} = newUser;

      // Validate required fields
      if (!uid || !phone_number || !display_name || !current_city || !city_map[current_city]) {
        functions.logger.error({
          message: "Invalid user data",
          uid: uid,
          phone_number: phone_number,
          current_city: current_city,
          display_name: display_name,
          docId: context.params.docId,
          timestamp: new Date().toISOString(),
        });
        await snap.ref.delete();
        return;
      }

      try {
        const cityConfigRef = db.collection("city_config").doc(current_city);
        const cityConfigDoc = await cityConfigRef.get();

        if (!cityConfigDoc.exists) {
          functions.logger.error({
            message: "City config not found",
            current_city: current_city,
            docId: context.params.docId,
            timestamp: new Date().toISOString(),
          });
          await snap.ref.delete();
          return;
        }

        // Atomically increment totalUsers and fetch the updated value
        await cityConfigRef.update({
          totalUsers: admin.firestore.FieldValue.increment(1),
        });
        const updatedCityConfigDoc = await cityConfigRef.get();
        const totalUsers = updatedCityConfigDoc.data().totalUsers || 0;

        let messageBody;
        if (totalUsers >= 500) {
          messageBody = `Hey ${display_name}, welcome to Mesh! ${city_map[current_city]} has ${totalUsers} members. Join us Saturdays at 10am for coffee meetups – invites are free, you pay when you join. – Stuart & Michael`;
        } else {
          messageBody = `Hey ${display_name}, welcome to Mesh! You’re #${totalUsers}/500 in ${city_map[current_city]}. We’ll invite you to Saturday coffee meetups at 500. Stay tuned! – Stuart & Michael`;
        }

        const formattedPhoneNumber = formatPhoneNumber(phone_number);
        // Send text message
        await client.messages.create({
          body: messageBody,
          from: twilioPhoneNumber,
          to: formattedPhoneNumber,
        });

        functions.logger.info({
          message: "Welcome text sent successfully",
          display_name: display_name,
          phone_number: phone_number,
          current_city: current_city,
          totalUsers: totalUsers,
          docId: context.params.docId,
          timestamp: new Date().toISOString(),
        });

        // Delete the document from the tempbin
        await snap.ref.delete();
      } catch (error) {
        functions.logger.error({
          message: "Error sending welcome text",
          error: error.message,
          code: error.code,
          status: error.status,
          details: error.details,
          uid: uid,
          phone_number: phone_number,
          current_city: current_city,
          display_name: display_name,
          docId: context.params.docId,
          timestamp: new Date().toISOString(),
        });
        await snap.ref.delete(); // Clean up on failure
      }
    });

function formatPhoneNumber(phoneNumber) {
  let formatted = phoneNumber.replace(/[^+\d]/g, "");
  // If the number doesn't start with "+", assume it's a US number and prepend "+1"
  if (!formatted.startsWith("+")) {
    formatted = `+1${formatted}`;
  }
  // E.164 format: +[country code][number], typically 10-15 digits including country code
  if (formatted.length < 11 || formatted.length > 15) {
    throw new Error(`Invalid phone number format: ${phoneNumber} (formatted: ${formatted})`);
  }
  return formatted;
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
