const functions = require("firebase-functions");
const admin = require("firebase-admin");
const moment = require("moment");
// this only works for madison_wi as of jan/4/2025


function getNextSaturday() {
  const today = new Date();
  return new Date(today.setDate(today.getDate() + ((6 - today.getDay() + 7) % 7)));
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}_${day}_${year}`;
}

exports.getLobbyStats = functions.firestore
    .document("get_lobby_stats_tempbin/{docId}")
    .onWrite(async (change, context) => {
      const db = admin.firestore();
      const nextSaturday = getNextSaturday();
      const formattedDate = formatDate(nextSaturday);
      const subcollectionRef = db.collection("lobby")
          .doc(formattedDate).collection("madison_wi");

      try {
        const snapshot = await subcollectionRef.get();
        const count = snapshot.size;

        if (count === 0) {
          console.log("No documents found in subcollection.");
          return null;
        }

        const ages = [];
        const genderCounts = {male: 0, female: 0, other: 0};
        const ageDistribution = {
          "18-29": 0, "30-39": 0, "40-49": 0, "50-59": 0, "60+": 0,
        };
        const signUpsByDay = {};
        const signUpsByHour = {};

        snapshot.forEach((doc) => {
          const data = doc.data();

          // Age analysis
          const birthDate = moment(data.age, "MM/DD/YYYY");
          const age = moment().diff(birthDate, "years");
          if (!isNaN(age)) {
            ages.push(age);
            if (age >= 18 && age <= 29) ageDistribution["18-29"]++;
            else if (age <= 39) ageDistribution["30-39"]++;
            else if (age <= 49) ageDistribution["40-49"]++;
            else if (age <= 59) ageDistribution["50-59"]++;
            else ageDistribution["60+"]++;
          }

          // Gender distribution
          if (data.sex === "male") genderCounts.male++;
          else if (data.sex === "female") genderCounts.female++;
          else genderCounts.other++;

          // Sign-up distribution
          const createdAt = moment(data.createdAt);
          const dayKey = createdAt.format("YYYY-MM-DD");
          const hourKey = createdAt.format("HH");
          signUpsByDay[dayKey] = (signUpsByDay[dayKey] || 0) + 1;
          signUpsByHour[hourKey] = (signUpsByHour[hourKey] || 0) + 1;
        });

        // Calculate statistics
        const averageAge = ages.reduce((sum, age) => sum + age, 0) / ages.length;
        const medianAge = ages.sort((a, b) => a - b)[Math.floor(ages.length / 2)];

        const genderDistribution = {
          male: (genderCounts.male / count * 100).toFixed(2) + "%",
          female: (genderCounts.female / count * 100).toFixed(2) + "%",
          other: (genderCounts.other / count * 100).toFixed(2) + "%",
        };

        const peakSignUpDay = Object.entries(signUpsByDay)
            .sort((a, b) => b[1] - a[1])[0];
        const peakSignUpHour = Object.entries(signUpsByHour)
            .sort((a, b) => b[1] - a[1])[0];

        console.log(`Total documents: ${count}`);
        console.log(`Valid age entries: ${ages.length}`);
        console.log(`Average age: ${averageAge.toFixed(2)}`);
        console.log(`Median age: ${medianAge}`);
        console.log("Age distribution:", ageDistribution);
        console.log("Gender distribution:", genderDistribution);
        console.log("Sign-ups by day:", signUpsByDay);
        console.log("Sign-ups by hour:", signUpsByHour);
        console.log(`Peak sign-up day: ${peakSignUpDay[0]} with ${peakSignUpDay[1]} sign-ups`);
        console.log(`Peak sign-up hour: ${peakSignUpHour[0]}:00 with ${peakSignUpHour[1]} sign-ups`);

        return null;
      } catch (error) {
        console.error("Error retrieving documents or calculating statistics:", error);
        return null;
      }
    });
