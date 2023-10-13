import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {unqueueUser} from "../utils/unqueueUser";
import {getCityFromLatLng} from "../utils/getCityFromLatLng";
import {notifyUser} from "./sendNotifications";


export const joinLobby = functions.firestore
    .document("join_lobby_tempbin/{doc}")
    .onCreate(async (snapshot, context) => {
      const partyMembers = snapshot.data().party;
      const today = snapshot.data().today;
      const geoLocation = snapshot.data().geo_location;
      const outingType = snapshot.data().outing_type as string;

      if (outingType == null) {
        console.log(`outingType is null, 
        stopping cloud function. 
        Likely that the user has a version of 
        the app that does not support outingType.`);
        return null;
      }
      let city: string | null = null;

      if (geoLocation && "latitude" in
      geoLocation && "longitude" in geoLocation) {
        city = await getCityFromLatLng(
            geoLocation.latitude, geoLocation.longitude);
      }

      if (today) {
        const lobbyTonightRef = admin.firestore()
            .collection(`lobby_tonight_${outingType}`);
        const partyDocRef = lobbyTonightRef.doc();
        const userRef = admin.firestore().collection("user");
        const userDoc = await userRef.doc(partyMembers[0].id).get();
        const message = `Your liked locations are not open today.
Please choose other locations.`;
        await notifyUser(userDoc.id, message);


        const batch = admin.firestore().batch();
        let partyLocations = [];

        // Query the lobby_tonight collection for
        // documents with userDoc as member0 or member1
        // Essentially "are you already queued tonight?"
        const member0Query = await lobbyTonightRef
            .where("member0", "==", userDoc.ref).get();
        const member1Query = await lobbyTonightRef
            .where("member1", "==", userDoc.ref).get();

        // Check if any documents are returned in either query
        if (!member0Query.empty || !member1Query.empty) {
          console.log(`User ${userDoc.id} is already 
          in lobby_tonight as member0 or member1`);
          return null;
        }
        if (userDoc.exists) {
          const userData = userDoc.data();
          if (userData) {
            if (userData.liked_places) {
              partyLocations.push(...userData.liked_places);
              if (city === null) {
                const userRef = admin.firestore()
                    .collection("user").doc(partyMembers[0].id);
                await unqueueUser(today, userRef);
              } else {
                try {
                  for (const location of partyLocations) {
                    console.log("Before filter: ", location.path);
                  }
                  // Filter a user's liked locations within haversine distance
                  partyLocations =
                  await filterLocations(partyLocations, city);

                  // Filter these liked locations by whether they are open today
                  for (const location of partyLocations) {
                    console.log("After filter: ", location.path);
                  }

                  if (partyLocations.length === 0) {
                    const userRef = admin.firestore()
                        .collection("user").doc(partyMembers[0].id);
                    await unqueueUser(today, userRef);
                  }
                } catch (err) {
                  console.error(err);
                }
              }
            } else {
              console.error(`The 'liked_places' field does not exist in the user
                document with ID ${partyMembers[0].id}.`);
            }
          } else {
            console.error(`The userData does not exist in the user
              document with ID ${partyMembers[0].id}.`);
          }
        } else {
          console.error(`The userDoc document does not exist in the user
              collection with ID ${partyMembers[0].id}.`);
        }

        // store the locations array in the party{count} document
        const partyData: any = {locations: partyLocations};
        if (city) {
          partyData.city = city;
        }
        batch.set(partyDocRef, partyData, {merge: true});


        for (let i = 0; i < partyMembers.length; i++) {
          batch.set(partyDocRef, {["member" + (i)]: partyMembers[i]}
              , {merge: true});
        }

        return batch.commit() .then(() => {
          console.log("Batch write successful!");
        })
            .catch((error) => {
              console.error("Batch write failed: ", error);
            });
      } else if (!today) {
        const lobbyTomorrowRef = admin.firestore()
            .collection(`lobby_tomorrow_${outingType}`);
        const partyDocRef = lobbyTomorrowRef.doc();
        const userRef = admin.firestore().collection("user");
        const userDoc = await userRef.doc(partyMembers[0].id).get();
        const batch = admin.firestore().batch();
        let partyLocations = [];

        // Query the lobby_tonight collection for
        // documents with userDoc as member0 or member1
        const member0Query = await lobbyTomorrowRef
            .where("member0", "==", userDoc.ref).get();
        const member1Query = await lobbyTomorrowRef
            .where("member1", "==", userDoc.ref).get();

        // Check if any documents are returned in either query
        if (!member0Query.empty || !member1Query.empty) {
          console.log(`User ${userDoc.id} is already
           in lobby_tonight as member0 or member1`);
          return null;
        }


        if (userDoc.exists) {
          const userData = userDoc.data();
          if (userData) {
            if (userData.liked_places) {
              partyLocations.push(...userData.liked_places);
              if (city === null) {
                const userRef = admin.firestore()
                    .collection("user").doc(partyMembers[0].id);
                await unqueueUser(today, userRef);
              } else {
                try {
                  for (const location of partyLocations) {
                    console.log("Before filter: ", location.path);
                  }
                  // Filter a user's liked locations within haversine distance
                  partyLocations =
                  await filterLocations(partyLocations, city);

                  // Filter these liked locations by whether they are open today
                  for (const location of partyLocations) {
                    console.log("After filter: ", location.path);
                  }

                  if (partyLocations.length === 0) {
                    const userRef = admin.firestore()
                        .collection("user").doc(partyMembers[0].id);
                    await unqueueUser(today, userRef);
                  }
                } catch (err) {
                  console.error(err);
                }
              }
            } else {
              console.error(`The 'liked_places' field does not exist in the user
                document with ID ${partyMembers[0].id}.`);
            }
          } else {
            console.error(`The userData does not exist in the user
              document with ID ${partyMembers[0].id}.`);
          }
        } else {
          console.error(`The userDoc document does not exist in the user
              collection with ID ${partyMembers[0].id}.`);
        }

        // store the locations array in the party{count} document
        const partyData: any = {locations: partyLocations};
        if (city) {
          partyData.city = city;
        }
        batch.set(partyDocRef, partyData, {merge: true});

        for (let i = 0; i < partyMembers.length; i++) {
          batch.set(partyDocRef, {["member" + (i)]: partyMembers[i]}
              , {merge: true});
        }

        return batch.commit() .then(() => {
          console.log("Batch write successful!");
        })
            .catch((error) => {
              console.error("Batch write failed: ", error);
            });
      }
      /**
       * Returns the current day name in the format: "open_<day>_1800".
       * The day is calculated based on the America/Chicago time zone.
       * @return {string} The current day name in the "open_<day>_1800" format.
       */
      function getTodayFieldName(): string {
        const today = new Date();
        const options: Intl.DateTimeFormatOptions =
        {weekday: "long", timeZone: "America/Chicago"};
        const dayName = new Intl.DateTimeFormat("en-US", options)
            .format(today).toLowerCase();
        return `open_${dayName}_1800`;
      }

      /**
       * Checks if a location is open today.
       * This function reads the Firestore document at the
       * provided path and checks the boolean field "open_<today>_1800".
       * @param {string} locationPath - The Firestore document path.
       * @return {Promise<boolean>} A promise that resolves with
       *  a boolean indicating whether the location is open today.
       */
      async function isOpenToday(locationPath: string): Promise<boolean> {
        const doc = await admin.firestore().doc(locationPath).get();
        const todayFieldName = getTodayFieldName();
        return doc.exists && doc.get(todayFieldName) === true;
      }

      /**
       * Checks if an array of locations are open today and filters the array.
       * This function filters the locations by their city and
       * then checks each Firestore document to see if they are open today.
       * @param {any[]} partyLocations - An array of objects,
       *  each containing a Firestore document path.
       * @param {string} city - The city to filter locations by.
       * @return {Promise<any[]>} A promise that resolves with
       *  the filtered array of locations open today.
       */
      async function filterLocations(partyLocations: any[], city: string):
       Promise<any[]> {
        partyLocations = partyLocations
            .filter((location) => location.path.endsWith(city));

        // Use Promise.all to wait for all promises to resolve
        const locationsOpenToday = await Promise
            .all(partyLocations.map((location) => isOpenToday(location.path)));

        // Filter out locations that are not open today
        return partyLocations.filter((_, index) => locationsOpenToday[index]);
      }
    });


