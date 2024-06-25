const functions = require('firebase-functions');
const admin = require('firebase-admin');
const twilio = require('twilio');

// Twilio configuration
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

const client = new twilio(accountSid, authToken);

exports.sendSmsInvites = functions.runWith({ timeoutSeconds: 540 })
    .firestore
    .document('send_sms_invites_tempbin/{docId}')
    .onCreate(async (snap, context) => {
        const data = snap.data();
        const { locationId, userIds } = data;

        if (!locationId || !userIds || !Array.isArray(userIds)) {
            console.error('Invalid data in send_sms_invites_tempbin document');
            return null;
        }

        const message = `Click this link to join us for coffee, https://nextjs-mesh-seven.vercel.app/?location=${locationId}&route=invitedConfirm`;

        const CHUNK_SIZE = 10;
        await processUserChunks(userIds, 0, message, locationId);

        // Delete the document after processing
        await snap.ref.delete();
    });

async function processUserChunks(userIds, start, message, locationId) {
    const chunk = userIds.slice(start, start + CHUNK_SIZE);
    for (const userId of chunk) {
        try {
            const userDoc = await admin.firestore().collection('users').doc(userId).get();
            if (!userDoc.exists) {
                console.warn(`User ${userId} not found`);
                continue;
            }
            const user = userDoc.data();
            const rawPhoneNumber = user.phone_number;

            if (!rawPhoneNumber) {
                console.warn(`Phone number not found for user ${userId}`);
                continue;
            }

            const formattedPhoneNumber = formatPhoneNumber(rawPhoneNumber);
            console.log("Sending to: ", formattedPhoneNumber);

            await sendTextInvite(formattedPhoneNumber, message);
            await new Promise((resolve) => setTimeout(resolve, 20));
        } catch (error) {
            console.error(`Error processing user ${userId}:`, error);
        }
    }

    const nextStart = start + CHUNK_SIZE;
    if (nextStart < userIds.length) {
        // Invoke the function recursively to handle the next chunk
        await processUserChunks(userIds, nextStart, message, locationId);
    } else {
        console.log(`Finished processing all users for location ${locationId}`);
    }
}

function formatPhoneNumber(phoneNumber) {
    return phoneNumber.replace(/[^+\d]/g, "");
}

async function sendTextInvite(formattedPhoneNumber, message) {
    try {
        const response = await client.messages.create({
            body: message,
            from: twilioPhoneNumber,
            to: formattedPhoneNumber,
        });
        console.log("Message sent, SID:", response.sid);
    } catch (error) {
        console.error("Error sending text message:", error);
        console.error("Error details:", {
            message: error.message,
            response: error.response,
            code: error.code,
            errno: error.errno,
        });
    }
}