import * as admin from "firebase-admin";


/**
 * Unqueues a user by adding their document reference
 *  to the quit_lobby_tempbin collection.
 *
 * @param {boolean} today - A boolean indicating
 *  if the user wants to join a lobby today.
 * @param {FirebaseFirestore.DocumentReference} userRef
 * - The user's Firestore document reference.
 * @return {Promise<void>}
 */
export async function unqueueUser(today: boolean,
    userRef: FirebaseFirestore.DocumentReference) {
  const quitLobbyTempbinRef = admin.firestore()
      .collection("quit_lobby_tempbin");
  const quitDocRef = quitLobbyTempbinRef.doc();

  try {
    await quitDocRef.set({
      party: [userRef],
      today: today,
    });
    console.log("User added to quit_lobby_tempbin successfully!");
  } catch (error) {
    console.error("Error adding user to quit_lobby_tempbin: ", error);
  }
}
