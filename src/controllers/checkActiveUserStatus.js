const functions = require('firebase-functions');
const admin = require('firebase-admin');
// To avoid deployment errors, do not call admin.initializeApp() in your code 2

exports.checkActiveUserStatus = functions.https.onCall(async (data, context) => {
  try {
    const db = admin.firestore();
    const currentDate = new Date();
    const threeMonthsAgo = new Date(currentDate);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const twoMonthsAgo = new Date(currentDate);
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

    const activeCitiesSnapshot = await db.collection('city_config').where('isActive', '==', true).get();
    const activeCities = activeCitiesSnapshot.docs.map(doc => doc.data().city);

    const usersSnapshot = await db.collection('users')
      .where('current_city', 'in', activeCities)
      .get();

    const pausedUserPhones = [];

    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      if (userData.pause_invites === true) continue;

      let lobbyRef = userData.lobby_ref || null;
      const createdTime = userData.created_time || null;

      let shouldPause = false;

      // Handle lobby_ref as DocumentReference or string
      if (lobbyRef) {
        if (typeof lobbyRef === 'object' && lobbyRef._path) {
          // Extract path from DocumentReference
          lobbyRef = lobbyRef.path;
        }

        if (typeof lobbyRef === 'string' && lobbyRef.includes('/')) {
          const lobbyParts = lobbyRef.split('/');
          if (lobbyParts.length > 1) {
            const lobbyDate = new Date(lobbyParts[1].replace(/_/g, '/'));
            if (lobbyDate < threeMonthsAgo) {
              shouldPause = true;
            }
          } else {
            console.error(`Malformed lobby_ref for user ${userDoc.id}: ${lobbyRef}`);
          }
        } else {
          console.error(`Invalid lobby_ref type for user ${userDoc.id}: ${JSON.stringify(lobbyRef)}`);
        }
      }

      // Check created_time if no valid lobby_ref
      if ((!lobbyRef || typeof lobbyRef !== 'string' || !lobbyRef.includes('/')) && createdTime) {
        const createdDate = new Date(createdTime);
        if (createdDate < twoMonthsAgo) {
          shouldPause = true;
        }
      } else if (!createdTime) {
        console.error(`Missing created_time for user ${userDoc.id}`);
      }

      if (shouldPause) {
        await userDoc.ref.update({ pause_invites: true });
        if (userData.phone_number) {
          pausedUserPhones.push(userData.phone_number);
        }
      }
    }

    // Write phone numbers to tempbin_send_active_user_status
    if (pausedUserPhones.length > 0) {
      await db.collection('send_active_user_status_tempbin').add({
        phone_number: pausedUserPhones,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return { success: true, message: 'Active user status checked and updated successfully.' };
  } catch (error) {
    console.error('Error checking active user status:', error);
    throw new functions.https.HttpsError('internal', 'Failed to check active user status.');
  }
});