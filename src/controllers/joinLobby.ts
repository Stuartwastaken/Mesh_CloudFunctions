import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {unqueueUser} from "../utils/unqueueUser";
import {getCityFromLatLng} from "../utils/getCityFromLatLng";


export const joinLobby = functions.firestore
    .document("join_lobby_tempbin/{doc}")
    .onCreate(async (snapshot, context) => {
      const partyMembers = snapshot.data().party;
      const today = snapshot.data().today;
      const geoLocation = snapshot.data().geo_location;

      let city: string | null = null;

      if (geoLocation && "latitude" in
      geoLocation && "longitude" in geoLocation) {
        city = await getCityFromLatLng(
            geoLocation.latitude, geoLocation.longitude);
      }

      if (today) {
        const lobbyTonightRef = admin.firestore().collection("lobby_tonight");
        const partyDocRef = lobbyTonightRef.doc();

        const batch = admin.firestore().batch();
        const userRef = admin.firestore().collection("user");
        let partyLocations = [];

        const userDoc = await userRef.doc(partyMembers[0].id).get();
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
                partyLocations = partyLocations
                    .filter((location) => location.path.endsWith(city));
                if (partyLocations.length === 0) {
                  const userRef = admin.firestore()
                      .collection("user").doc(partyMembers[0].id);
                  await unqueueUser(today, userRef);
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
        const lobbyTomorrowRef = admin.firestore().collection("lobby_tomorrow");
        const partyDocRef = lobbyTomorrowRef.doc();


        const batch = admin.firestore().batch();
        const userRef = admin.firestore().collection("user");
        let partyLocations = [];

        const userDoc = await userRef.doc(partyMembers[0].id).get();
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
                partyLocations = partyLocations
                    .filter((location) => location.path.endsWith(city));
                if (partyLocations.length === 0) {
                  const userRef = admin.firestore()
                      .collection("user").doc(partyMembers[0].id);
                  await unqueueUser(today, userRef);
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
    });


