const functions = require("firebase-functions");
const axios = require("axios");
const admin = require("firebase-admin");

const timeZones = {
  "America/New_York": "Eastern",
  "America/Chicago": "Central",
  "America/Denver": "Mountain",
  "America/Los_Angeles": "Pacific",
};

function createScheduledInviteFunction(timeZone) {
  return functions.pubsub
      .schedule("0 10 * * 3")
      .timeZone(timeZone)
      .onRun(async (context) => {
        const baseUrl = "https://us-central1-mesh-alpha-7s78jh.cloudfunctions.net/ffsendInvites";

        try {
          const activeCities = await getActiveCitiesForTimeZone(timeZone);
          console.log(`Active cities for ${timeZones[timeZone]} Time: ${activeCities.join(", ")}`);

          for (const city of activeCities) {
            const url = `${baseUrl}?city=${encodeURIComponent(city)}`;
            console.log(`Calling ffsendInvites for city: ${city}`);
            const response = await axios.get(url);
            console.log(`HTTP function called successfully for ${city}:`, response.status);
          }

          return null;
        } catch (error) {
          console.error(`Error in scheduledWednesdayInvite for ${timeZones[timeZone]} Time:`, error);
          throw new Error(`Failed to process invites for ${timeZones[timeZone]} Time cities`);
        }
      });
}

async function getActiveCitiesForTimeZone(timeZone) {
  const cityConfigsSnapshot = await admin.firestore().collection("city_configs")
      .where("isActive", "==", true)
      .where("timeZone", "==", timeZone)
      .get();

  return cityConfigsSnapshot.docs.map((doc) => doc.id);
}

exports.scheduledWednesdayInviteEastern = createScheduledInviteFunction("America/New_York");
exports.scheduledWednesdayInviteCentral = createScheduledInviteFunction("America/Chicago");
exports.scheduledWednesdayInviteMountain = createScheduledInviteFunction("America/Denver");
exports.scheduledWednesdayInvitePacific = createScheduledInviteFunction("America/Los_Angeles");
