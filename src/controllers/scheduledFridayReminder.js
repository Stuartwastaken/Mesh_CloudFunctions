const functions = require("firebase-functions");
const admin = require("firebase-admin");

const timeZones = {
  "America/New_York": "Eastern",
  "America/Chicago": "Central",
  "America/Denver": "Mountain",
  "America/Los_Angeles": "Pacific",
};

function createScheduledFridayReminder(timeZone) {
  return functions.pubsub
      .schedule("0 17 * * 5")
      .timeZone(timeZone)
      .onRun(async (context) => {
        try {
          const db = admin.firestore();
          const activeCities = await getActiveCitiesForTimeZone(timeZone);

          for (const city of activeCities) {
            await db.collection("remind_lobby_tempbin").add({
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              city: city,
              timeZone: timeZone,
            });
            console.log(`Reminder document created for ${city} in ${timeZones[timeZone]} Time`);
          }

          return null;
        } catch (error) {
          console.error(`Error creating reminder documents for ${timeZones[timeZone]} Time:`, error);
          throw new Error(`Failed to create reminder documents for ${timeZones[timeZone]} Time`);
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

exports.scheduledFridayReminderEastern = createScheduledFridayReminder("America/New_York");
exports.scheduledFridayReminderCentral = createScheduledFridayReminder("America/Chicago");
exports.scheduledFridayReminderMountain = createScheduledFridayReminder("America/Denver");
exports.scheduledFridayReminderPacific = createScheduledFridayReminder("America/Los_Angeles");
