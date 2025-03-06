const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const REVENUECAT_AUTH_HEADER = functions.config().revenuecat.auth_header;

exports.revenueCatWebhook = functions.https.onRequest(async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    // Validate the Authorization header
    if (!authHeader || authHeader !== `Bearer ${REVENUECAT_AUTH_HEADER}`) {
      console.error(JSON.stringify({
        message: "Unauthorized webhook request",
        receivedAuthHeader: authHeader,
        expectedAuthHeader: `Bearer ${REVENUECAT_AUTH_HEADER}`,
        timestamp: new Date().toISOString(),
      }));
      return res.status(403).send("Forbidden: Invalid Authorization Header");
    }

    // Extracting necessary fields safely
    const event = req.body?.event;
    let app_user_id = event?.app_user_id || req.body?.app_user_id;
    const entitlements = event?.entitlement_ids || req.body?.entitlements || {};
    const eventType = event?.type || req.body?.type;
    const expirationDate = event?.expiration_at_ms || null; // RevenueCat sends expiration timestamp

    console.log(JSON.stringify({
      message: "Raw request received",
      requestBody: req.body,
      extracted_app_user_id: app_user_id,
      timestamp: new Date().toISOString(),
    }));

    // Validate app_user_id
    if (!app_user_id || typeof app_user_id !== "string" || !app_user_id.trim()) {
      console.error(JSON.stringify({
        message: "Missing or invalid app_user_id in RevenueCat webhook request",
        requestBody: req.body,
        extracted_app_user_id: app_user_id,
        appUserIdLength: app_user_id ? app_user_id.length : "(undefined)",
        trimmedAppUserIdLength: app_user_id ? app_user_id.trim().length : "(undefined)",
        timestamp: new Date().toISOString(),
      }));
      return res.status(400).send("Bad Request: Missing or invalid app_user_id");
    }

    // Trim the user ID to remove any trailing whitespace
    app_user_id = app_user_id.trim();

    const userRef = db.collection("users").doc(app_user_id);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      console.warn(JSON.stringify({
        message: "User document not found",
        app_user_id: app_user_id,
        timestamp: new Date().toISOString(),
      }));
      return res.status(404).send("User not found");
    }

    const userData = userDoc.data();
    const hasLifetimeEntitlement = userData?.has_lifetime_entitlement === true;

    // Determine if user should be verified
    let isVerified =
      hasLifetimeEntitlement ||
      (entitlements && Array.isArray(entitlements) && entitlements.length > 0);

    // If it's an EXPIRATION event or expiration timestamp is in the past, set verified to false
    if (eventType === "EXPIRATION" || (expirationDate && expirationDate < Date.now())) {
      isVerified = false;
    }

    // Preserve super_group if already true, but set to false if premium expires
    let newSuperGroup =
      typeof userData.super_group !== "undefined" ? userData.super_group : false;
    if (!isVerified) {
      newSuperGroup = false;
    }

    // Log structured data
    console.log(JSON.stringify({
      eventType: eventType,
      app_user_id: app_user_id,
      entitlements: entitlements,
      hasLifetimeEntitlement: hasLifetimeEntitlement,
      isVerified: isVerified,
      expirationDate: expirationDate ? new Date(expirationDate).toISOString() : "None",
      firestoreUpdate: userData.verified !== isVerified || userData.super_group !== newSuperGroup ? "Updated" : "No change",
      timestamp: new Date().toISOString(),
    }));

    // Only update Firestore if necessary
    if (userData.verified !== isVerified || userData.super_group !== newSuperGroup) {
      await userRef.update({verified: isVerified, super_group: newSuperGroup});
      console.log(`Updated Firestore for user ${app_user_id}: verified=${isVerified}, super_group=${newSuperGroup}`);
    }

    res.status(200).send("Success");
  } catch (error) {
    console.error(JSON.stringify({
      message: "Error processing RevenueCat webhook",
      error: error.toString(),
      stack: error.stack,
      timestamp: new Date().toISOString(),
    }));
    res.status(500).send("Internal Server Error");
  }
});
