const functions = require("firebase-functions");
const admin = require("firebase-admin");

exports.ffsendInvites = functions.https.onRequest(async (request, response) => {
  try {
    const today = new Date();
    const thisYear = today.getFullYear();

    const usersSnapshot = await admin.firestore().collection("users")
        .where("current_city", "==", "madison_wi").get();
    const olderUsers = [];
    const youngerUsers = [];
    usersSnapshot.forEach((doc) => {
      const user = {
        ...doc.data(),
        uid: doc.id,
        preferred_sides: doc.data().preferred_sides || [], // Now an array
      };
      const birthday = new Date(user.birthday);
      const age = thisYear - birthday.getFullYear();
      (age >= 32 ? olderUsers : youngerUsers).push(user);
    });

    shuffle(olderUsers);
    shuffle(youngerUsers);
    console.log("total older users: ", olderUsers.length);
    console.log("total younger users: ", youngerUsers.length);

    const locationsSnapshot = await admin.firestore().collection("location").get();
    let locations = locationsSnapshot.docs.map((doc) => ({
      ...doc.data(),
      id: doc.id,
      users: [],
      usersLength: 0,
      side_of_town: doc.data().side_of_town,
    }));
    shuffle(locations);

    // Process older users and get the used location IDs
    const olderLocations = processUsers([...locations], olderUsers);
    const usedLocationIds = new Set(olderLocations.map((loc) => loc.id));

    // Filter out locations used by older users
    locations = locations.filter((loc) => !usedLocationIds.has(loc.id));

    // Process younger users with the remaining locations
    const youngerLocations = processUsers(locations, youngerUsers);
    const batch = admin.firestore().batch();
    let totalInvited = 0;
    const activeLocations = [];

    for (const location of olderLocations.concat(youngerLocations)) {
      console.log(`Location: ${location.name}, Users Invited: ${location.usersLength}`);
      totalInvited += location.usersLength;

      const validUserIds = location.users.reduce((acc, user, index) => {
        if (user.uid) {
          acc.push(user.uid);
        } else {
          console.log(`User at index ${index} in location ${location.id} is missing uid property`);
        }
        return acc;
      }, []);

      const inviteRef = admin.firestore().collection("send_sms_invites_tempbin").doc();
      batch.set(inviteRef, {
        locationId: location.id,
        userIds: validUserIds,
      });

      // Add location to activeLocations array
      activeLocations.push({
        locationId: location.id,
        expirationDate: admin.firestore.Timestamp.fromDate(getNextSunday()),
        isActive: true,
      });
    }

    // Write active locations to the 'active_locations' collection
    for (const activeLocation of activeLocations) {
      const activeLocationRef = admin.firestore().collection("active_locations").doc(activeLocation.locationId);
      batch.set(activeLocationRef, activeLocation);
    }

    await batch.commit();

    console.log(`Total invited users: ${totalInvited}`);
    console.log(`Active locations set: ${activeLocations.length}`);

    if (totalInvited < olderUsers.length + youngerUsers.length) {
      console.warn("Not all users were invited due to capacity constraints");
    }

    response.send("Invites processed and active locations set");
  } catch (error) {
    console.error("Error processing invites", error);
    response.status(500).send("Error processing invites");
  }
});

function processUsers(locations, users) {
  const minInvites = 48;
  const capacityMultiplier = 4;
  const processedLocations = [];

  // Sort users: those with preferences first, then those without
  users.sort((a, b) => b.preferred_sides.length - a.preferred_sides.length);

  while (users.length > 0 && locations.length > 0) {
    const user = users.shift();
    let location;

    if (user.preferred_sides.length > 0) {
      // Find a location matching any of the user's preferences
      location = locations.find((loc) => user.preferred_sides.includes(loc.side_of_town));

      // If no preferred location is available, find any available location
      if (!location) {
        location = locations[0];
      }
    } else {
      // For users without preference, use the first available location
      location = locations[0];
    }

    // If the location is at capacity, remove it from the list and continue
    if (location.usersLength >= location.capacity * capacityMultiplier) {
      locations = locations.filter((loc) => loc.id !== location.id);
      users.unshift(user); // Put the user back at the start of the queue
      continue;
    }

    // Add user to the location
    location.users.push(user);
    location.usersLength++;

    // If the location reaches minimum capacity, move it to processedLocations
    if (location.usersLength >= minInvites) {
      processedLocations.push(location);
      locations = locations.filter((loc) => loc.id !== location.id);
    }
  }

  // Handle any remaining locations
  for (const location of locations) {
    if (location.usersLength > 0) {
      processedLocations.push(location);
    }
  }

  // Redistribute users if necessary
  for (const location of processedLocations) {
    if (location.usersLength < minInvites) {
      redistributeUsers(location, processedLocations, minInvites);
    }
  }

  return processedLocations;
}

function redistributeUsers(location, processedLocations, minInvites) {
  const needed = minInvites - location.usersLength;
  const additionalUsers = [];

  for (const procLoc of processedLocations) {
    if (procLoc.id === location.id) continue;
    const availableUsers = Math.min(procLoc.usersLength - minInvites, needed - additionalUsers.length);
    if (availableUsers > 0) {
      additionalUsers.push(...procLoc.users.splice(-availableUsers));
      procLoc.usersLength -= availableUsers;
    }
    if (additionalUsers.length >= needed) break;
  }

  location.users.push(...additionalUsers);
  location.usersLength += additionalUsers.length;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// Helper function to get next Sunday's date
function getNextSunday() {
  const today = new Date();
  const nextSunday = new Date(today);
  nextSunday.setDate(today.getDate() + (7 - today.getDay()) % 7);
  nextSunday.setHours(23, 59, 59, 999); // Set to end of day
  return nextSunday;
}
