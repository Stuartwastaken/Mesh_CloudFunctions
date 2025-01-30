const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");
const zlib = require("zlib");

function compressUrl(url) {
  const inputBuffer = Buffer.from(url, "utf8");
  const compressedBuffer = zlib.deflateSync(inputBuffer);
  return compressedBuffer.toString("base64");
}

exports.generateReferralLink = functions.https.onCall(async (data, context) => {
  try {
    console.log("Incoming data:", JSON.stringify(data));

    const uid = data.uid;
    const name = data.name;
    const pfpUrl = data.pfp;

    // Basic validation
    if (!uid || !name || !pfpUrl) {
      throw new functions.https.HttpsError("invalid-argument", "Missing uid, name, or pfp");
    }

    const compressedPfp = compressUrl(pfpUrl);
    const referralHash = crypto.randomBytes(8).toString("hex");
    await admin.firestore().collection("referrals").doc(referralHash).set({
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      used: false,
      uid,
      name,
      originalPfp: pfpUrl,
      compressedPfp: compressedPfp,
    });

    const baseUrl = "https://nextjs-mesh-seven.vercel.app/";
    const route = "acceptReferral";
    const userRef = uid;
    const referralLink = `${baseUrl}?` +
      `route=${encodeURIComponent(route)}&` +
      `name=${encodeURIComponent(name)}&` +
      `pfp=${encodeURIComponent(compressedPfp)}&` +
      `userRef=${encodeURIComponent(userRef)}&` +
      `referralHash=${encodeURIComponent(referralHash)}`;

    console.log("Referral Link Generated: ", referralLink);
    return {referralLink}; // Respond with JSON object directly
  } catch (error) {
    console.error("Error generating referral link:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});
