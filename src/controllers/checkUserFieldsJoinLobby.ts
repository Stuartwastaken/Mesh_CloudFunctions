import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
// this was deployed in flutterflow as of 3/3/2025

interface RequestData {
    location: admin.firestore.DocumentReference;
    uid: string;
}

async function isUserInLobby(userData: FirebaseFirestore.DocumentData): Promise<boolean> {
  if (!userData.lobby_ref) return false;

  try {
    const lobbyDoc = await userData.lobby_ref.get();
    return lobbyDoc.exists;
  } catch (error) {
    console.error("Error checking lobby status:", error);
    return false;
  }
}

export const checkUserFieldsJoinLobby = functions.https.onCall(async (data: RequestData, context) => {
  try {
    // Validate input data
    if (!data.location || !data.uid) {
      return {
        success: false,
        error: "Missing required fields: location and uid are required",
      };
    }

    // Get user document
    const userDoc = await admin.firestore()
        .collection("users")
        .doc(data.uid)
        .get();

    if (!userDoc.exists) {
      return {
        success: false,
        error: "User document not found",
      };
    }

    const userData = userDoc.data();
    if (!userData) {
      return {
        success: false,
        error: "User data is empty",
      };
    }

    // Check if user is already in a lobby
    if (await isUserInLobby(userData)) {
      return {
        success: false,
        error: "User is already in a lobby",
      };
    }

    const locationData = (await data.location.get()).data();
    if (!locationData) {
      return {
        success: false,
        error: "Location document not found",
      };
    }

    // Check if user is verified
    if (userData.verified === true) {
      // Update current_city if different
      if (userData.current_city !== locationData.city) {
        await admin.firestore()
            .collection("users")
            .doc(data.uid)
            .update({current_city: locationData.city});
      }

      // Write to join_lobby_tempbin
      await admin.firestore()
          .collection("join_lobby_tempbin")
          .add({
            uid: userData.uid,
            location: data.location,
            age: userData.birthday,
            name: userData.display_name,
            sex: userData.sex,
            city: locationData.city,
            testing: false,
          });

      return {
        success: true,
        message: "User verified and added to lobby",
      };
    }

    // If not verified, check passes
    const passes = userData.passes || 0;
    if (passes > 0) {
      // Call spendPassJoinLobby function
      const spendPassResult = await admin.firestore().runTransaction(async (transaction) => {
        const userRef = admin.firestore().collection("users").doc(data.uid);

        // Update passes, last spent date, and current_city if different
        const updates: any = {
          passes: admin.firestore.FieldValue.increment(-1),
          last_pass_spent_date: admin.firestore.Timestamp.now(),
        };

        if (userData.current_city !== locationData.city) {
          updates.current_city = locationData.city;
        }

        transaction.update(userRef, updates);

        // Add to join_lobby_tempbin
        return await admin.firestore()
            .collection("join_lobby_tempbin")
            .add({
              uid: [admin.firestore().collection("users").doc(data.uid)],
              location: data.location,
              age: userData.birthday,
              name: userData.display_name,
              sex: userData.sex,
              city: locationData.city,
              testing: false,
            });
      });

      return {
        success: true,
        message: "Using pass to join lobby",
        spendPassResult,
      };
    }

    // If neither verified nor has passes
    return {
      success: false,
      error: "User is not verified and has no passes available",
    };
  } catch (error) {
    console.error("Error in checkUserFieldsJoinLobby:", error);
    return {
      success: false,
      error: "Internal server error",
    };
  }
});
