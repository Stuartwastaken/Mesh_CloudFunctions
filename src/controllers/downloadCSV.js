const functions = require("firebase-functions");
const admin = require("firebase-admin");
const {Parser} = require("json2csv");
const {Storage} = require("@google-cloud/storage");
const path = require("path");
const os = require("os");
const fs = require("fs");


const storage = new Storage();

function normalizePhoneNumber(phone) {
  // Remove any non-numeric characters
  const digits = phone.replace(/\D/g, "");
  // Ensure it starts with country code 1
  const normalized = digits.startsWith("1") ? digits : "1" + digits;
  // Return the normalized phone number with +1
  return `'+${normalized}`;
}


exports.downloadCSV = functions.firestore
    .document("download_csv_tempbin/{docId}")
    .onCreate(async (snapshot, context) => {
      try {
        // Reference to the Firestore 'users' collection
        const usersRef = admin.firestore().collection("users");
        const userSnapshot = await usersRef.get();

        if (userSnapshot.empty) {
          console.log("No users found");
          return;
        }

        // Array to hold user data
        const users = [];

        userSnapshot.forEach((doc) => {
          const userData = doc.data();
          users.push({
            phone_number: normalizePhoneNumber(userData.phone_number || ""),
            display_name: userData.display_name || "",
            city: userData.current_city || "",
            birthday: userData.birthday || "",
          });
        });

        // Convert JSON to CSV
        const json2csvParser =
        new Parser({fields: ["phone_number", "display_name",
          "city", "birthday"]});
        const csv = json2csvParser.parse(users);

        // Define temporary file path
        const tempFilePath = path.join(os.tmpdir(), "users_data.csv");

        // Write CSV to temporary file
        fs.writeFileSync(tempFilePath, csv);

        // Define storage bucket and file path
        const bucketName = "mesh-alpha-7s78jh.appspot.com";
        const destination = "users_firestore_data/users_data.csv";

        // Upload the file to Cloud Storage
        await storage.bucket(bucketName).upload(tempFilePath, {
          destination: destination,
        });

        // Cleanup temporary file
        fs.unlinkSync(tempFilePath);

        console.log(`File uploaded to ${destination}`);
        return;
      } catch (error) {
        console.error("Error exporting users to CSV:", error);
        return;
      }
    });
