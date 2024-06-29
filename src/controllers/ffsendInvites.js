const functions = require('firebase-functions');
const admin = require('firebase-admin');

exports.ffsendInvites = functions.https.onRequest(async (request, response) => {
    try {
        const today = new Date();
        const thisYear = today.getFullYear();

        const usersSnapshot = await admin.firestore().collection('users')
            .where('current_city', '==', 'madison_wi').get();
        const olderUsers = [];
        const youngerUsers = [];
        usersSnapshot.forEach(doc => {
            const user = doc.data();
            const birthday = new Date(user.birthday);
            const age = thisYear - birthday.getFullYear();
            (age >= 32 ? olderUsers : youngerUsers).push(user);
        });

        shuffle(olderUsers);
        shuffle(youngerUsers);
        console.log("total older users: ", olderUsers.length);
        console.log("total younger users: ", youngerUsers.length);

        const locationsSnapshot = await admin.firestore().collection('location').get();
        let locations = locationsSnapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id,
            users: [],
            usersLength: 0
        }));
        shuffle(locations);

        // Process older users and get the used location IDs
        const olderLocations = processUsers(locations, olderUsers);
        const usedLocationIds = new Set(olderLocations.map(loc => loc.id));

        // Filter out locations used by older users
        locations = locations.filter(loc => !usedLocationIds.has(loc.id));

        // Process younger users with the remaining locations
        const youngerLocations = processUsers(locations, youngerUsers);
        const batch = admin.firestore().batch();
        let totalInvited = 0;
        for (const location of olderLocations.concat(youngerLocations)) {
            console.log(`Location: ${location.name}, Users Invited: ${location.usersLength}`);
            totalInvited += location.usersLength;

           const inviteRef = admin.firestore().collection('send_sms_invites_tempbin').doc();
            batch.set(inviteRef, {
                locationId: location.id,
                userIds: location.users.map(user => user.uid)
            });
        }

        await batch.commit();

        console.log(`Total invited users: ${totalInvited}`);

        if (totalInvited < olderUsers.length + youngerUsers.length) {
            console.warn("Not all users were invited due to capacity constraints");
        }

        response.send("Invites processed");
    } catch (error) {
        console.error("Error processing invites", error);
        response.status(500).send("Error processing invites");
    }
});

function processUsers(locations, users) {
    const minInvites = 48;
    const capacityMultiplier = 4;
    const processedLocations = [];

    while (users.length > 0 && locations.length > 0) {
        const location = locations.shift();
        const capacity = location.capacity * capacityMultiplier;
        location.users = users.splice(0, Math.min(capacity, users.length));
        location.usersLength = location.users.length;

        if (location.usersLength < minInvites) {
            redistributeUsers(location, processedLocations, minInvites);
        }

        processedLocations.push(location);
    }

    return processedLocations;
}

function redistributeUsers(location, processedLocations, minInvites) {
    const needed = minInvites - location.usersLength;
    let additionalUsers = [];

    for (const procLoc of processedLocations) {
        const availableUsers = Math.min(procLoc.usersLength - minInvites, needed);
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