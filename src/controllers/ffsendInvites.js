// this is a backup as of jan/6/2025
const functions = require('firebase-functions');
const admin = require('firebase-admin');

function safeLength(arr) {
    return arr ? arr.length : 0;
}

exports.ffsendInvites = functions.https.onRequest(async (request, response) => {
    try {
        const city = request.query.city || (request.body.data && request.body.data.city);
        
        console.log("Processing, Request query parameters:", JSON.stringify(request.query));
        if (!city) {
            console.log("Request query parameters:", JSON.stringify(request.query));
            throw new Error("City parameter is required");
        }

        console.log(`Starting ffsendInvites function for city: ${city}`);

        const { olderUsers, youngerUsers } = await fetchAndSortUsers(city);
        console.log(`Fetched users: ${olderUsers.length} older, ${youngerUsers.length} younger`);

        let locations = await fetchLocations(city);
        console.log(`Fetched ${locations.length} locations`);

        const { locations: olderLocations, groupType: olderGroupType } = await processUserGroup(locations, olderUsers, "older");
        console.log(`Processed older users: ${olderLocations.length} locations used`);

        const remainingLocations = locations.filter(loc => !olderLocations.some(olderLoc => olderLoc.id === loc.id));
        console.log(`Remaining locations for younger users: ${remainingLocations.length}`);

        const { locations: youngerLocations, groupType: youngerGroupType } = await processUserGroup(remainingLocations, youngerUsers, "younger");
        console.log(`Processed younger users: ${youngerLocations.length} locations used`);

        const allProcessedLocations = [
            ...olderLocations.map(loc => ({ ...loc, groupType: olderGroupType })),
            ...youngerLocations.map(loc => ({ ...loc, groupType: youngerGroupType }))
        ];
        console.log(`Total processed locations: ${allProcessedLocations.length}`);

        // Log locations in the desired format
        allProcessedLocations.forEach(location => {
            console.log(`Location: ${location.name}, Users Invited: ${location.usersLength} (${location.groupType} users)`);
        });

        const invites = createInvites(allProcessedLocations);
        console.log(`Created ${invites.length} invites`);

        const activeLocations = createActiveLocations(allProcessedLocations);
        console.log(`Created ${activeLocations.length} active locations`);

        await writeToFirestore(invites, activeLocations);
        console.log("Wrote invites and active locations to Firestore");

        const totalInvited = allProcessedLocations.reduce((sum, loc) => sum + loc.usersLength, 0);
        console.log(`Total invited users: ${totalInvited}`);
        console.log(`Active locations set: ${activeLocations.length}`);

        if (totalInvited < olderUsers.length + youngerUsers.length) {
            console.warn(`Not all users were invited. Invited: ${totalInvited}, Total users: ${olderUsers.length + youngerUsers.length}`);
        }

        response.send("Invites processed and active locations set");
    } catch (error) {
        console.error("Error processing invites", error);
        console.error("Error stack:", error.stack);
        response.status(500).send(`Error processing invites: ${error.message}`);
    }
});

async function fetchAndSortUsers(city) {
    console.log(`Fetching and sorting users for city: ${city}`);
    const thisYear = new Date().getFullYear();
    const usersSnapshot = await admin.firestore().collection('users')
        .where('current_city', '==', city).get();

    const olderUsers = [];
    const youngerUsers = [];
    let pausedInvitesCount = 0;

    usersSnapshot.forEach(doc => {
        const user = { ...doc.data(), uid: doc.id };
        
        // Check if pause_invites is true
        if (user.pause_invites === true) {
            pausedInvitesCount++;
            return; // Skip this user
        }

        if (!user.birthday) {
            console.warn(`User ${user.uid} has no birthday, skipping`);
            return;
        }
        const birthday = new Date(user.birthday);
        const age = thisYear - birthday.getFullYear();
        (age >= 32 ? olderUsers : youngerUsers).push(user);
    });

    console.log(`Fetched ${olderUsers.length} older users and ${youngerUsers.length} younger users`);
    console.log(`Users with paused invites: ${pausedInvitesCount}`);
    return { olderUsers: shuffle(olderUsers), youngerUsers: shuffle(youngerUsers) };
}

async function fetchLocations(city) {
    console.log(`Fetching locations for city: ${city}`);
    const locationsSnapshot = await admin.firestore().collection('location')
        .where('city', '==', city).get();
    const locations = shuffle(locationsSnapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
        users: [],
        usersLength: 0
    })));
    console.log(`Fetched ${locations.length} locations`);
    return locations;
}

async function processUserGroup(locations, users, groupType) {
    console.log(`Processing ${groupType} user group: ${users.length} users, ${locations.length} locations`);
    const processedLocations = [];
    const capacityMultiplier = 7;

    users.sort((a, b) => safeLength(b.preferred_side) - safeLength(a.preferred_side));

    for (const user of users) {
        let location = findSuitableLocation(locations, user, capacityMultiplier);
        if (!location) {
            console.log(`No suitable location found for user ${user.uid}, stopping processing`);
            break;
        }

        location.users.push(user);
        location.usersLength++;

        if (location.usersLength >= location.capacity * capacityMultiplier) {
            processedLocations.push(location);
            locations = locations.filter(loc => loc.id !== location.id);
            console.log(`Location ${location.id} reached capacity, removed from available locations`);
        }
    }

    const remainingWithUsers = locations.filter(loc => loc.usersLength > 0);
    processedLocations.push(...remainingWithUsers);
    console.log(`Processed ${processedLocations.length} locations for ${groupType} users`);

    return { locations: redistributeUsersIfNeeded(processedLocations), groupType };
}

function findSuitableLocation(locations, user, capacityMultiplier) {
    let location;
    location = locations.find(loc => loc.usersLength < loc.capacity * capacityMultiplier);
    return location;
}

function redistributeUsersIfNeeded(locations) {
    console.log("Redistributing users if needed");
    const minInvites = 100;
    for (const location of locations) {
        if (location.usersLength < minInvites) {
            console.log(`Location ${location.id} has ${location.usersLength} users, needs redistribution`);
            redistributeUsers(location, locations, minInvites);
        }
    }
    return locations;
}

function redistributeUsers(location, allLocations, minInvites) {
    const needed = minInvites - location.usersLength;
    console.log(`Redistributing ${needed} users to location ${location.id}`);
    for (const otherLoc of allLocations) {
        if (otherLoc.id === location.id) continue;
        const availableUsers = Math.min(otherLoc.usersLength - minInvites, needed);
        if (availableUsers > 0) {
            const users = otherLoc.users.splice(-availableUsers);
            location.users.push(...users);
            location.usersLength += users.length;
            otherLoc.usersLength -= users.length;
            console.log(`Moved ${users.length} users from location ${otherLoc.id} to ${location.id}`);
            if (location.usersLength >= minInvites) break;
        }
    }
}

function createInvites(locations) {
    console.log("Creating invites");
    return locations.map(location => ({
        locationId: location.id,
        userIds: location.users.map(user => user.uid).filter(Boolean)
    }));
}

function createActiveLocations(locations) {
    console.log("Creating active locations");

    return locations.map(location => ({
        locationId: location.id,
        expirationDate: admin.firestore.Timestamp.fromDate(getNextSunday()),
        isActive: true,
        users: location.users.map(user => admin.firestore().doc(`users/${user.uid}`)),
        user_age_group: location.groupType === 'older' ? 'older_users' : 'younger_users'
    }));
}



async function writeToFirestore(invites, activeLocations) {
    console.log("Writing to Firestore");
    const batch = admin.firestore().batch();

    invites.forEach(invite => {
        const inviteRef = admin.firestore().collection('send_sms_invites_tempbin').doc();
        batch.set(inviteRef, invite);
    });

    activeLocations.forEach(activeLocation => {
        const activeLocationRef = admin.firestore().collection('active_locations').doc(activeLocation.locationId);
        batch.set(activeLocationRef, {
            expirationDate: activeLocation.expirationDate,
            isActive: activeLocation.isActive,
            users: activeLocation.users,
            locationId: activeLocation.locationId,
            user_age_group: activeLocation.user_age_group
        });
    });

    await batch.commit();
    console.log("Finished writing to Firestore");
}


function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function getNextSunday() {
    const today = new Date();
    const nextSunday = new Date(today);
    nextSunday.setDate(today.getDate() + (7 - today.getDay()) % 7);
    nextSunday.setHours(23, 59, 59, 999);
    return nextSunday;
}