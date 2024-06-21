const functions = require("firebase-functions");
const admin = require("firebase-admin");
const moment = require("moment");


exports.getLobbyStats = functions.firestore
    .document("get_lobby_stats_tempbin/{docId}")
    .onWrite(async (change, context) => {
      const db = admin.firestore();
      const subcollectionRef = db.collection("lobby")
          .doc("6_22_2024").collection("madison_wi");

      try {
        const snapshot = await subcollectionRef.get();
        const count = snapshot.size;

        if (count === 0) {
          console.log("No documents found in subcollection.");
          return null;
        }

        const ages = [];

        snapshot.forEach((doc) => {
          const data = doc.data();
          const ageString = data.age;
          const birthDate = moment(ageString, "DD/MM/YYYY");
          const age = moment().diff(birthDate, "years");
          ages.push(age);
        });

        const averageAge = ages.reduce((sum, age) => sum + age, 0) / ages.length;

        ages.sort((a, b) => a - b);
        const medianAge = (ages.length % 2 === 0) ?
                (ages[ages.length / 2 - 1] + ages[ages.length / 2]) / 2 :
                ages[Math.floor(ages.length / 2)];

        console.log(`Total documents: ${count}`);
        console.log(`Average age: ${averageAge}`);
        console.log(`Median age: ${medianAge}`);

        return null;
      } catch (error) {
        console.error(`Error retrieving documents 
                or calculating statistics:`, error);
        return null;
      }
    });
