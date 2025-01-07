const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

// Helper function to get the last digit of current year
const getYearLastDigit = () => {
  const year = new Date().getFullYear();
  return year.toString().slice(-1);
};

// Helper function to create the regex pattern
const createDateRegexPattern = () => {
  const lastDigit = getYearLastDigit();
  // Pattern matches: 1-2 digits, underscore, 1-2 digits, underscore, 202X (where X is 4 or current year's last digit)
  return new RegExp(`^\\d{1,2}_\\d{1,2}_202[4-${lastDigit}]$`);
};

exports.scheduledClearGroupedCollection = functions.pubsub
    .schedule("0 12 * * 0")
    .timeZone("America/Chicago")
    .onRun(async (context) => {
      const db = admin.firestore();
      const groupedRef = db.collection("grouped");

      try {
        const snapshot = await groupedRef.get();
        const batch = db.batch();
        let deleteCount = 0;

        // Get the current date regex pattern
        const dateRegex = createDateRegexPattern();

        snapshot.forEach((doc) => {
          const docId = doc.id;

          // Now using dynamic regex pattern that preserves all valid date formats
          if (!dateRegex.test(docId)) {
            batch.delete(doc.ref);
            deleteCount++;
          }
        });

        await batch.commit();
        console.log(`Deleted ${deleteCount} documents from 'grouped' collection.`);
        return null;
      } catch (error) {
        console.error("Error clearing grouped collection:", error);
        throw new Error("Failed to clear grouped collection");
      }
    });
