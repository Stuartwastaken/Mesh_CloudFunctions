const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const REVENUECAT_AUTH_HEADER = functions.config().revenuecat.auth_header;

exports.revenueCatWebhook = functions.https.onRequest(async (req, res) => {
  try {
    const {event, app_user_id, entitlements} = req.body;
    const authHeader = req.headers.authorization;

    // Validate the Authorization header
    if (!authHeader || authHeader !== `Bearer ${REVENUECAT_AUTH_HEADER}`) {
      console.error("Unauthorized webhook request");
      return res.status(403).send("Forbidden: Invalid Authorization Header");
    }

    // Validate app_user_id
    if (!app_user_id || typeof app_user_id !== "string" || !app_user_id.trim()) {
      console.error("Missing or invalid app_user_id in RevenueCat webhook request.");
      return res.status(400).send("Bad Request: Missing or invalid app_user_id");
    }

    const userRef = db.collection("users").doc(app_user_id.trim());
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      console.warn(`User document not found for app_user_id: ${app_user_id}`);
      return res.status(404).send("User not found");
    }

    const userData = userDoc.data();
    const hasLifetimeEntitlement = userData?.has_lifetime_entitlement === true;

    // Ensure entitlements is an object before checking keys
    const isVerified =
      hasLifetimeEntitlement || (entitlements && typeof entitlements === "object" && Object.keys(entitlements).length > 0);

    console.log(
        `User ${app_user_id} ${
        hasLifetimeEntitlement ?
          "has lifetime entitlement. Keeping verified = true." :
          isVerified ?
          "has an active subscription. Setting verified = true." :
          "does not have an active subscription. Setting verified = false."
        }`
    );

    // Only update Firestore if necessary
    if (userData.verified !== isVerified || userData.super_group !== isVerified) {
      await userRef.update({verified: isVerified, super_group: isVerified});
      console.log(`Updated Firestore: verified = ${isVerified}, super_group = ${isVerified} for user ${app_user_id}`);
    } else {
      console.log(`No Firestore update needed for user ${app_user_id}, verified and super_group status unchanged.`);
    }

    res.status(200).send("Success");
  } catch (error) {
    console.error("Error processing RevenueCat webhook:", error);
    res.status(500).send("Internal Server Error");
  }
});
