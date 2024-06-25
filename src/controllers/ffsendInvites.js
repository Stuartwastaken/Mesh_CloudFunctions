// almost works but has some logic issues like
// old peopel and young people get invites to the same place
// the remaining location is too small
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
            if (age >= 32) {
                olderUsers.push(user);
            } else {
                youngerUsers.push(user);
            }
        });

        console.log(`Total older users: ${olderUsers.length}`);
        console.log(`Total younger users: ${youngerUsers.length}`);

        shuffle(olderUsers);
        shuffle(youngerUsers);

        const locationsSnapshot = await admin.firestore().collection('location').get();
        const locations = [];
        locationsSnapshot.forEach(doc => {
            locations.push({...doc.data(), id: doc.id});
        });
        shuffle(locations);

        const invites = {};
        let remainingCapacity = new Map();

        // Process older users
        for (const location of locations) {
            const capacity = location.capacity * 4;
            invites[location.id] = {
                locationName: location.name,
                users: [],
                usersLength: 0,
                capacity: capacity
            };
            while (invites[location.id].users.length < capacity && olderUsers.length > 0) {
                invites[location.id].users.push(olderUsers.shift());
                invites[location.id].usersLength++;
            }
            remainingCapacity.set(location.id, capacity - invites[location.id].usersLength);
        }

        // Process younger users using remaining capacity
        for (const location of locations) {
            const capacity = remainingCapacity.get(location.id);
            while (invites[location.id].users.length < invites[location.id].capacity && youngerUsers.length > 0) {
                invites[location.id].users.push(youngerUsers.shift());
                invites[location.id].usersLength++;
            }
        }

        let totalInvited = 0;
        for (const locationId in invites) {
            if (invites[locationId].usersLength > 0) {
                console.log(`Location: ${invites[locationId].locationName}, Users Invited: ${invites[locationId].usersLength}`);
                totalInvited += invites[locationId].usersLength;
            }
        }

        console.log(`Total invited users: ${totalInvited}`);

        response.send("Invites processed");
    } catch (error) {
        console.error("Error processing invites", error);
        response.status(500).send("Error processing invites");
    }
});

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}