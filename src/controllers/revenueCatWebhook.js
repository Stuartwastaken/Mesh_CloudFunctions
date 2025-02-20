const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const REVENUECAT_AUTH_HEADER = functions.config().revenuecat.auth_header;

exports.revenueCatWebhook = functions.https.onRequest(async (req, res) => {
  try {
    console.log("Raw Request Body:", JSON.stringify(req.body, null, 2));

    const {event} = req.body;

    // Extract app_user_id properly from different possible locations
    let appUserId = req.body.app_user_id || (event && event.app_user_id);

    console.log("Extracted app_user_id:", appUserId);

    if (!appUserId || typeof appUserId !== "string" || !appUserId.trim()) {
      console.error("Missing or invalid app_user_id:", appUserId);
      return res.status(400).send("Bad Request: Missing or invalid app_user_id");
    }

    appUserId = appUserId.trim();

    const authHeader = req.headers.authorization;

    // Validate Authorization header
    if (!authHeader || authHeader !== `Bearer ${REVENUECAT_AUTH_HEADER}`) {
      console.error("Unauthorized webhook request");
      return res.status(403).send("Forbidden: Invalid Authorization Header");
    }

    const userRef = db.collection("users").doc(appUserId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      console.warn(`User document not found for app_user_id: ${appUserId}`);
      return res.status(404).send("User not found");
    }

    const userData = userDoc.data();
    const hasLifetimeEntitlement = userData?.has_lifetime_entitlement === true;

    // Ensure entitlements is an object before checking keys
    const entitlements = event?.entitlement_ids || [];
    const isVerified = hasLifetimeEntitlement || (Array.isArray(entitlements) && entitlements.length > 0);

    console.log(`User ${appUserId} ${hasLifetimeEntitlement ?
      "has lifetime entitlement. Keeping verified = true." :
      isVerified ?
      "has an active subscription. Setting verified = true." :
      "does not have an active subscription. Setting verified = false."
    }`);

    // Update Firestore only if necessary
    if (userData.verified !== isVerified || userData.super_group !== isVerified) {
      await userRef.update({verified: isVerified, super_group: isVerified});
      console.log(`Updated Firestore: verified = ${isVerified}, super_group = ${isVerified} for user ${appUserId}`);
    } else {
      console.log(`No Firestore update needed for user ${appUserId}, verified and super_group status unchanged.`);
    }

    res.status(200).send("Success");
  } catch (error) {
    console.error("Error processing RevenueCat webhook:", error);
    res.status(500).send("Internal Server Error");
  }
});
