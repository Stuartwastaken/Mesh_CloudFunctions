import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const searchRadius = 50; // Radius in km

/**
 * Retrieves the city name from a given latitude and
 * longitude using the Google Maps Geocoding API.
 * @param {number} latitude - The latitude of the location.
 * @param {number} longitude - The longitude of the location.
 * @return {Promise<string|null>} A Promise that resolves to the city name,
 *  or null if the city cannot be determined.
 */
async function getCityFromLatLng(latitude: number, longitude: number):
 Promise<string | null> {
  for (const city of majorCities) {
    const distance = haversineDistance(latitude,
        longitude, city.latitude, city.longitude);
    if (distance <= searchRadius) {
      return city.name;
    }
  }

  return null;
}


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
              if (city) {
                partyLocations = partyLocations
                    .filter((location) => location.path.endsWith(city));
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
              if (city) {
                partyLocations = partyLocations
                    .filter((location) => location.path.endsWith(city));
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


    interface City {
      name: string;
      latitude: number;
      longitude: number;
    }

const majorCities: City[] = [
  {
    name: "Chicago_Illinois",
    latitude: 41.8781,
    longitude: -87.6298,
  },
  {
    name: "Madison_Wisconsin",
    latitude: 43.0838,
    longitude: -89.4411,
  },
  {
    name: "Miami_Florida",
    latitude: 25.7617,
    longitude: -80.1918,
  },
  {
    name: "SaintLouis_Missouri",
    latitude: 38.6270,
    longitude: -90.1994,
  },
  // ... add more major cities and their coordinates
];


/**
 * Calculate the Haversine distance between two latitude and longitude points.
 *
 * @param {number} lat1 - The latitude of the first point.
 * @param {number} lon1 - The longitude of the first point.
 * @param {number} lat2 - The latitude of the second point.
 * @param {number} lon2 - The longitude of the second point.
 * @return {number} The Haversine distance in kilometers between the two points.
 */
function haversineDistance(lat1: number, lon1: number,
    lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) * Math.cos(
            toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}


/**
 *
 * @param {number} degrees - The degree you would like to convert.
 * @return {number} The radians equivalent of the degrees input.
 */
function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

