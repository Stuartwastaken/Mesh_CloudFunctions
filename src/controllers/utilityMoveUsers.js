const functions = require('firebase-functions');
const admin = require('firebase-admin');

const db = admin.firestore();

exports.utilityMoveUsers = functions.firestore
  .document('utility_move_users_lobby_tempbin/{docId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const { date, currentLocationId } = data;

    try {
      // Update status to processing
      await snap.ref.update({ status: 'processing' });

      // Step 1: Get the current location document
      const currentLocationRef = db.collection('active_locations').doc(currentLocationId);
      const currentLocationDoc = await currentLocationRef.get();
      
      if (!currentLocationDoc.exists) {
        await snap.ref.update({ 
          status: 'error',
          error: 'Current location does not exist'
        });
        return;
      }

      const currentLocation = currentLocationDoc.data();
      if (!currentLocation.isActive) {
        await snap.ref.update({ 
          status: 'completed',
          message: 'Location is already inactive',
          newLocationId: null
        });
        return;
      }

      const city = currentLocation.city;
      const userAgeGroup = currentLocation.user_age_group;

      // Step 2: Find a new active location in the same city with the same user_age_group
      const newLocationQuery = db.collection('active_locations')
        .where('city', '==', city)
        .where('user_age_group', '==', userAgeGroup)
        .where('isActive', '==', true)
        .where('expirationDate', '>', admin.firestore.Timestamp.now())
        .where('locationId', '!=', currentLocationId)
        .limit(1);

      const newLocationSnapshot = await newLocationQuery.get();
      if (newLocationSnapshot.empty) {
        await snap.ref.update({ 
          status: 'error',
          error: 'No other active location found'
        });
        return;
      }

      const newLocationDoc = newLocationSnapshot.docs[0];
      const newLocationId = newLocationDoc.id;
      const newLocationRef = db.collection('active_locations').doc(newLocationId);

      // Step 3: Get all users in the current location for the specified date
      const dateDocRef = db.collection('lobby').doc(date);
      const citiesSnapshot = await dateDocRef.listCollections();
      const userPromises = citiesSnapshot.map(cityCollection => {
        return cityCollection.where('locationId', '==', currentLocationId).get();
      });
      const userSnapshots = await Promise.all(userPromises);
      const userDocs = [];
      userSnapshots.forEach(snapshot => {
        snapshot.docs.forEach(doc => userDocs.push(doc));
      });

      if (userDocs.length === 0) {
        // No users to move, but still deactivate the location if required
        await currentLocationRef.update({ isActive: false });
        await snap.ref.update({ 
          status: 'completed',
          message: 'No users to move',
          newLocationId: null
        });
        return;
      }

      // Step 4: Update each user's locationId in lobby and their location reference in users collection
      const batch = db.batch();
      
      // Get all user IDs to update their documents
      const userIds = userDocs.map(doc => doc.data().userId);
      
      // Update lobby documents
      userDocs.forEach(doc => {
        batch.update(doc.ref, { locationId: newLocationId });
      });

      // Update user documents with new location reference
      userIds.forEach(userId => {
        const userRef = db.collection('users').doc(userId);
        batch.update(userRef, { 
          location: newLocationRef,
          locationUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      });

      await batch.commit();

      // Step 5: Set the current location's isActive to false
      await currentLocationRef.update({ isActive: false });

      // Step 6: Update tempbin document with success status
      await snap.ref.update({ 
        status: 'completed',
        newLocationId,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        usersMovedCount: userDocs.length,
        updatedUserIds: userIds
      });

      console.log(`Successfully moved ${userDocs.length} users from ${currentLocationId} to ${newLocationId} and updated their user documents`);
    } catch (error) {
      console.error('Error in utilityMoveUsers:', error);
      await snap.ref.update({ 
        status: 'error',
        error: error.message,
        errorAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  });