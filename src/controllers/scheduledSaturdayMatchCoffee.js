const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");
const {Timestamp} = admin.firestore;

exports.scheduledSaturdayMatchCoffee = functions.pubsub
    .schedule("0 8 * * 6")
    .timeZone("America/Chicago")
    .onRun(async (context) => {
      try {
        const cities = ["madison_wi", "another_location_id"];
        for (const city of cities) {
          await processLocations(city);
        }

        console.log("Processing complete for all locations.");
        return null;
      } catch (error) {
        console.error("Error during function execution: ", error);
        return null;
      }
    });

// Helper function to get the next Saturday
function getNextSaturday() {
  const today = new Date();
  if (today.getDay() === 6) {
    return today;
  } else {
    const nextSaturday = new Date(today);
    nextSaturday.setDate(today.getDate() + ((6 - today.getDay() + 7) % 7));
    return nextSaturday;
  }
}

// Helper function to format the date
function formatDate(date) {
  return `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`;
}

function generateRandom10DigitNumber() {
  const min = 1000000000;
  const max = 9999999999;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function calculateStandardDeviation(people) {
  if (people.length === 0) return 0;
  const mean = people.reduce((acc, person) => acc + person.year, 0) / people.length;
  const variance = people.reduce((acc, person) => acc + Math.pow(person.year - mean, 2), 0) / people.length;
  const stdDev = Math.sqrt(variance);
  return Math.min(stdDev, 5);
}

function sortByYearWithNoise(stdDev) {
  return function(a, b) {
    const noiseA = (Math.random() * 2 - 1) * stdDev;
    const noiseB = (Math.random() * 2 - 1) * stdDev;
    const yearA = a.year + noiseA;
    const yearB = b.year + noiseB;
    return yearA - yearB;
  };
}

function isFriend(name) {
  return name.includes("(friend)");
}

function adjustGenderBalance(groups) {
  for (let i = 0; i < groups.length; i++) {
    const maleCount = groups[i].filter((p) => p.gender === "M").length;
    const femaleCount = groups[i].filter((p) => p.gender === "F").length;

    if (maleCount === 3 && femaleCount === 1) {
      if (i > 0 && groups[i - 1].filter((p) => p.gender === "F").length >= 3) {
        const femaleToSwap = groups[i - 1].findIndex((p) => p.gender === "F");
        const maleToSwap = groups[i].findIndex((p) => p.gender === "M");
        [groups[i - 1][femaleToSwap], groups[i][maleToSwap]] = [groups[i][maleToSwap], groups[i - 1][femaleToSwap]];
      } else if (i < groups.length - 1 && groups[i + 1].filter((p) => p.gender === "F").length >= 3) {
        const femaleToSwap = groups[i + 1].findIndex((p) => p.gender === "F");
        const maleToSwap = groups[i].findIndex((p) => p.gender === "M");
        [groups[i + 1][femaleToSwap], groups[i][maleToSwap]] = [groups[i][maleToSwap], groups[i + 1][femaleToSwap]];
      }
    }
  }
}

function waterfall(groups) {
  for (let i = groups.length - 1; i > 0; i--) {
    while (groups[i].length < 3) {
      const needed = 3 - groups[i].length;
      const donorGroup = groups[i - 1];
      if (donorGroup.length > needed) {
        const membersToMove = donorGroup.splice(donorGroup.length - needed, needed);
        groups[i] = membersToMove.concat(groups[i]);
      } else {
        break;
      }
    }
  }
}

function groupPeople(people) {
  const maxAttempts = 10;
  let attempt = 0;
  const stdDev = calculateStandardDeviation(people);
  const sortFunction = sortByYearWithNoise(stdDev);

  while (attempt < maxAttempts) {
    shuffleArray(people);
    people.sort(sortFunction);

    let totalEffectiveSize = 0;
    people.forEach((person) => {
      totalEffectiveSize += isFriend(person.name) ? 2 : 1;
    });

    const groups = [];
    let currentGroup = [];
    let groupSize = 0;
    let femaleCount = 0;

    for (const person of people) {
      const effectiveSize = isFriend(person.name) ? 2 : 1;
      if (groupSize + effectiveSize > 4) {
        groups.push(currentGroup);
        currentGroup = [];
        groupSize = 0;
        femaleCount = 0;
      }

      if (groupSize + effectiveSize <= 4) {
        currentGroup.push(person);
        groupSize += effectiveSize;
        if (person.gender === "F") {
          femaleCount++;
        }
      } else {
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
        }
        currentGroup = [person];
        groupSize = effectiveSize;
        femaleCount = person.gender === "F" ? 1 : 0;
      }
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    if (groups.flat().length === people.length) {
      adjustGenderBalance(groups);
      waterfall(groups);
      return groups;
    }

    attempt++;
  }
  console.error("Failed to form groups after multiple attempts.");
  return [];
}

async function getPeopleFromFirestore(city) {
  const db = admin.firestore();
  const nextSaturday = formatDate(getNextSaturday());
  const peopleByLocation = {};

  const snapshot = await db.collection(`lobby/${nextSaturday}/${city}`).get();

  snapshot.forEach((doc) => {
    const data = doc.data();
    const genderMap = {male: "M", female: "F", pna: "P"};
    const dateParts = data.age.split("/");
    let year;

    if (dateParts.length === 3 && !isNaN(parseInt(dateParts[2], 10))) {
      year = parseInt(dateParts[2], 10);
    } else {
      console.error(`Incorrect date or format for ${data.name}: ${data.age}`);
      return;
    }

    const locationPath = typeof data.location === "object" && data.location.path ? data.location.path : data.location;

    if (!peopleByLocation[locationPath]) {
      peopleByLocation[locationPath] = [];
    }
    peopleByLocation[locationPath].push({
      uid: data.uid,
      gender: genderMap[data.sex] || "P",
      year,
      name: data.name,
      location: locationPath,
    });
  });

  return peopleByLocation;
}

async function processLocations(city) {
  const peopleByLocation = await getPeopleFromFirestore(city);

  for (const location in peopleByLocation) {
    if (Object.hasOwn(peopleByLocation, location)) {
      const people = peopleByLocation[location];
      const groups = groupPeople(people);

      await saveGroupsToFirestore(groups, city, location);
      await deleteDocuments(city, location, people);
    }
  }
}


async function saveGroupsToFirestore(groups, city, location) {
  const db = admin.firestore();
  const nextSaturday = formatDate(getNextSaturday());
  const locationPath = `grouped/${nextSaturday}/${city}/${location}`;
  let groupNumber = 1;

  for (const group of groups) {
    const groupDocRef = db.collection(locationPath).doc();
    const groupDocId = groupDocRef.id;
    const locationRef = db.doc(location);

    const membersRefs = group.map((member) => db.doc(`users/${member.uid}`));
    const groupDoc = {
      members: membersRefs,
      group_number: groupNumber++,
      location: locationRef,
      group_id: groupDocId,
    };

    await groupDocRef.set(groupDoc);

    const chatRef = db.collection("chats").doc();
    const chatData = {
      group_chat_id: generateRandom10DigitNumber(),
      last_message: "This is your group chat for this week!",
      last_message_seen_by: membersRefs.slice(0, 2),
      last_message_sent_by: membersRefs[0],
      last_message_time: Timestamp.fromDate(new Date()),
      user_a: membersRefs[0],
      user_b: membersRefs[1],
      users: membersRefs,
    };

    await chatRef.set(chatData);

    for (const member of group) {
      const userDocRef = db.collection("users").doc(member.uid);
      const doc = await userDocRef.get();
      if (doc.exists) {
        await userDocRef.update({
          group_id: groupDocId,
          searching: false,
        });
      } else {
        console.log(`No document found for UID: ${member.uid}, skipping update.`);
      }
    }

    const queryGroupedDocRef = db.collection("grouped").doc(groupDocId);
    await queryGroupedDocRef.set(groupDoc);
    console.log(`Group saved in ${locationPath} and in the global 'grouped' collection with ID ${groupDocId}`);
  }
}

async function deleteDocuments(city, location, people) {
  const db = admin.firestore();
  const nextSaturday = formatDate(getNextSaturday());
  for (const person of people) {
    await db.collection(`lobby/${nextSaturday}/${city}`).doc(person.uid).delete();
  }
}
