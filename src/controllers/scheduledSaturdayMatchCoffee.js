const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");
const {Timestamp} = admin.firestore;
const {notifyUser} = require("./sendNotifications");

admin.initializeApp(); // Ensure Firestore is initialized

// Function to get active cities for a given timezone
async function getActiveCitiesForTimeZone(timeZone) {
  const cityConfigsSnapshot = await admin
    .firestore()
    .collection("city_config")
    .where("isActive", "==", true)
    .where("timeZone", "==", timeZone)
    .get();

  return cityConfigsSnapshot.docs.map((doc) => doc.id);
}

// Create scheduled function for Saturday matching
function createScheduledSaturdayMatchCoffee(timeZone) {
  return functions.pubsub
      .schedule("0 8 * * 6") // Runs every Saturday at 8:00 AM
      .timeZone(timeZone)
      .onRun(async (context) => {
        try {
          const cities = await getActiveCitiesForTimeZone(timeZone);
          for (const city of cities) {
            await processLocations(city);
          }
          console.log(`Processing complete for all locations in ${timeZone}.`);
          return null;
        } catch (error) {
          console.error(
              `Error during function execution for ${timeZone}: `,
              error
          );
          return null;
        }
      });
}

// Export scheduled functions for different time zones
exports.scheduledSaturdayMatchCoffeeEastern =
  createScheduledSaturdayMatchCoffee("America/New_York");
exports.scheduledSaturdayMatchCoffeeCentral =
  createScheduledSaturdayMatchCoffee("America/Chicago");
exports.scheduledSaturdayMatchCoffeeMountain =
  createScheduledSaturdayMatchCoffee("America/Denver");
exports.scheduledSaturdayMatchCoffeePacific =
  createScheduledSaturdayMatchCoffee("America/Los_Angeles");

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

// Helper function to format the date as MM_DD_YYYY
function formatDate(date) {
  return `${date.getMonth() + 1}_${date.getDate()}_${date.getFullYear()}`;
}

// Generate a random 10-digit number for group chat IDs
function generateRandom10DigitNumber() {
  const min = 1000000000;
  const max = 9999999999;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Shuffle an array in place
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// Calculate standard deviation of years for sorting noise
function calculateStandardDeviation(people) {
  if (people.length === 0) return 0;
  const mean =
    people.reduce((acc, person) => acc + person.year, 0) / people.length;
  const variance =
    people.reduce((acc, person) => acc + Math.pow(person.year - mean, 2), 0) /
    people.length;
  const stdDev = Math.sqrt(variance);
  return Math.min(stdDev, 5);
}

// Sorting function with noise based on year
function sortByYearWithNoise(stdDev) {
  return function (a, b) {
    const noiseA = (Math.random() * 2 - 1) * stdDev;
    const noiseB = (Math.random() * 2 - 1) * stdDev;
    const yearA = a.year + noiseA;
    const yearB = b.year + noiseB;
    return yearA - yearB;
  };
}
function mergeGroupsTo5(groups) {
  // Separate groups into those with 2 members, 3 members, and others
  const groupsOf2 = groups.filter((g) => g.length === 2);
  const groupsOf3 = groups.filter((g) => g.length === 3);
  const otherGroups = groups.filter((g) => g.length !== 2 && g.length !== 3);
  const mergedGroups = [];

  // Merge groups of 2 and 3 into groups of 5 while pairs exist
  while (groupsOf2.length > 0 && groupsOf3.length > 0) {
    const group2 = groupsOf2.pop(); // Take one group of 2
    const group3 = groupsOf3.pop(); // Take one group of 3
    const mergedGroup = [...group2, ...group3]; // Combine into group of 5
    mergedGroups.push(mergedGroup);
  }

  // Reconstruct the groups list in place
  groups.length = 0; // Clear the original array
  groups.push(...otherGroups, ...mergedGroups, ...groupsOf2, ...groupsOf3);
}

// Validate groups for blocked users and gender balance
function validateGroups(groups) {
  let validationPassed = true;
  console.log("Running Validation Checks...");
  const allUsers = new Set(groups.flat().map((p) => p.uid));

  for (const group of groups) {
    for (const person of group) {
      for (const member of group) {
        if (person !== member && person.blockedUsers.has(member.uid)) {
          console.error(
              `Validation Failed: Blocked users in group! ${person.name} (UID: ${person.uid}) with ${member.name} (UID: ${member.uid})`
          );
          validationPassed = false;
        }
      }
    }

    const maleCount = group.filter((p) => p.gender === "M").length;
    const femaleCount = group.filter((p) => p.gender === "F").length;
    if (
      (maleCount === 3 && femaleCount === 1) ||
      (femaleCount === 3 && maleCount === 1)
    ) {
      console.error(
          `Validation Failed: Gender imbalance - Males: ${maleCount}, Females: ${femaleCount}`
      );
      validationPassed = false;
    }
  }

  if (validationPassed) {
    console.log("All validation checks passed!");
  } else {
    console.warn("Some validation checks failed.");
  }
}

// Adjust gender balance by swapping members
function adjustGenderBalance(groups) {
  for (let i = 0; i < groups.length; i++) {
    const maleCount = groups[i].filter((p) => p.gender === "M").length;
    const femaleCount = groups[i].filter((p) => p.gender === "F").length;

    if (maleCount === 3 && femaleCount === 1 && i > 0) {
      const prevFemales = groups[i - 1].filter((p) => p.gender === "F");
      if (prevFemales.length >= 3) {
        const femaleIdx = groups[i - 1].findIndex((p) => p.gender === "F");
        const maleIdx = groups[i].findIndex((p) => p.gender === "M");
        [groups[i - 1][femaleIdx], groups[i][maleIdx]] = [
          groups[i][maleIdx],
          groups[i - 1][femaleIdx],
        ];
      }
    }
  }
}

// Redistribute members to ensure minimum group size
function waterfall(groups) {
  for (let i = groups.length - 1; i > 0; i--) {
    while (groups[i].length < 3 && groups[i - 1].length > 3) {
      const member = groups[i - 1].pop();
      groups[i].unshift(member);
    }
  }
}

// Separate blocked users by swapping
function separateBlockedUsers(groups) {
  const maxAttempts = 5;
  let attempt = 0;

  while (attempt < maxAttempts) {
    let conflictFound = false;

    for (let i = 0; i < groups.length; i++) {
      for (let j = 0; j < groups[i].length; j++) {
        const person = groups[i][j];
        const blockedIdx = groups[i].findIndex((m) =>
          person.blockedUsers.has(m.uid)
        );
        if (blockedIdx !== -1 && blockedIdx !== j) {
          conflictFound = true;
          let swapped = false;

          for (let k = 0; k < groups.length && !swapped; k++) {
            if (k !== i) {
              for (let m = 0; m < groups[k].length; m++) {
                const candidate = groups[k][m];
                if (
                  candidate.gender === person.gender &&
                  !groups[i].some((m) => candidate.blockedUsers.has(m.uid))
                ) {
                  [groups[i][j], groups[k][m]] = [groups[k][m], groups[i][j]];
                  swapped = true;
                  break;
                }
              }
            }
          }
        }
      }
    }

    if (!conflictFound) break;
    attempt++;
  }
}

// Group people into sets of up to 4
function groupPeople(people) {
  const maxAttempts = 10;
  let attempt = 0;
  const stdDev = calculateStandardDeviation(people);
  const sortFunction = sortByYearWithNoise(stdDev);

  while (attempt < maxAttempts) {
    shuffleArray(people);
    people.sort(sortFunction);

    const groups = [];
    let currentGroup = [];
    let groupSize = 0;

    for (const person of people) {
      const effectiveSize = 1;
      if (groupSize + effectiveSize > 4) {
        groups.push(currentGroup);
        currentGroup = [person];
        groupSize = effectiveSize;
      } else {
        currentGroup.push(person);
        groupSize += effectiveSize;
      }
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    if (groups.flat().length === people.length) {
      adjustGenderBalance(groups);
      waterfall(groups);
      separateBlockedUsers(groups);
      validateGroups(groups);
      mergeGroupsTo5(groups);
      return groups;
    }

    attempt++;
  }
  console.error("Failed to form groups after multiple attempts.");
  return [];
}

// Fetch people from Firestore lobby
async function getPeopleFromFirestore(city) {
  const db = admin.firestore();
  const nextSaturday = formatDate(getNextSaturday());
  const peopleByLocation = {};

  const snapshot = await db.collection(`lobby/${nextSaturday}/${city}`).get();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const genderMap = { male: "M", female: "F", pna: "P" };
    const dateParts = data.age.split("/");
    const year = dateParts.length === 3 ? parseInt(dateParts[2], 10) : null;

    if (!year) {
      console.error(`Invalid date format for ${data.name}: ${data.age}`);
      continue;
    }

    const locationPath =
      typeof data.location === "object" && data.location.path
        ? data.location.path
        : data.location;

    if (!peopleByLocation[locationPath]) {
      peopleByLocation[locationPath] = [];
    }

    const blockedUsersSet = await getBlockedUsers(data.uid);

    peopleByLocation[locationPath].push({
      uid: data.uid,
      gender: genderMap[data.sex] || "P",
      year,
      name: data.name,
      location: locationPath,
      blockedUsers: blockedUsersSet,
    });
  }

  return peopleByLocation;
}

// Fetch blocked users for a given UID
async function getBlockedUsers(uid) {
  const db = admin.firestore();
  const blockedUsersSet = new Set();

  const blockedSnapshot = await db.collection(`users/${uid}/blocked`).get();
  blockedSnapshot.forEach((doc) => {
    const blockedData = doc.data();
    if (blockedData.uid) {
      blockedUsersSet.add(blockedData.uid.split("/").pop());
    }
  });

  return blockedUsersSet;
}

// Process locations and pair people
async function processLocations(city) {
  const db = admin.firestore();
  const nextSaturday = formatDate(getNextSaturday());
  const peopleByLocation = await getPeopleFromFirestore(city);

  for (const location in peopleByLocation) {
    if (Object.hasOwn(peopleByLocation, location)) {
      const people = peopleByLocation[location];
      const groups = groupPeople(people);
      console.log("Groups made: ", groups, "For location: ", location);

      // Filter groups: valid groups have 2 or more members
      const validGroups = groups.filter((group) => group.length >= 2);
      const tempbinPeople = groups.filter((group) => group.length < 2).flat();

      // Save valid groups to Firestore
      await saveGroupsToFirestore(validGroups, city, location);

      // Log unpaired individuals to not_paired_tempbin
      if (tempbinPeople.length > 0) {
        const tempbinRef = db.collection("not_paired_tempbin");
        for (const person of tempbinPeople) {
          await tempbinRef.add({
            uid: person.uid,
            name: person.name,
            location: location,
            city: city,
            date: nextSaturday,
            timestamp: Timestamp.fromDate(new Date()),
          });
          console.log(
              `Logged ${person.name} (UID: ${person.uid}) to not_paired_tempbin`
          );
        }
      }

      // Delete all people from the lobby after processing
      await deleteDocuments(city, people);
    }
  }
}

// Save groups to Firestore and create chats
async function saveGroupsToFirestore(groups, city, location) {
  const db = admin.firestore();
  const nextSaturday = formatDate(getNextSaturday());
  const locationPath = `grouped/${nextSaturday}/${city}/${location}`;
  let groupNumber = 1;

  for (const group of groups) {
    // Safeguard: skip groups with fewer than 2 members
    if (group.length < 2) {
      console.warn(
          `Skipping group with less than 2 members: ${group.map((p) => p.uid)}`
      );
      continue;
    }

    const groupDocRef = db.collection(locationPath).doc();
    const groupDocId = groupDocRef.id;
    const locationRef = db.doc(location);
    const randomHashForGroupChatId = generateRandom10DigitNumber();

    const membersRefs = group.map((member) => db.doc(`users/${member.uid}`));
    const groupDoc = {
      members: membersRefs,
      group_number: groupNumber++,
      location: locationRef,
      group_id: groupDocId,
      group_chat_id: randomHashForGroupChatId,
    };

    await groupDocRef.set(groupDoc);

    const chatRef = db.collection("chats").doc();
    const chatData = {
      group_chat_id: randomHashForGroupChatId,
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

        // Notify the user about their pairing
        await notifyUser(member.uid, {
          title: "You've been paired!",
          body: "Your coffee group is ready. Check your matches to meet your group!",
        });
      }
    }

    const queryGroupedDocRef = db.collection("grouped").doc(groupDocId);
    await queryGroupedDocRef.set(groupDoc);
    console.log(`Group saved with ID ${groupDocId}`);
  }
}

// Delete people from the lobby
async function deleteDocuments(city, people) {
  const db = admin.firestore();
  const nextSaturday = formatDate(getNextSaturday());
  for (const person of people) {
    await db
      .collection(`lobby/${nextSaturday}/${city}`)
      .doc(person.uid)
      .delete();
  }
}
