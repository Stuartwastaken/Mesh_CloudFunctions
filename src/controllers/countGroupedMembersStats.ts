import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface Member {
  id: string;
  name: string;
}

interface GroupDocData {
  members?: Member[];
}

/**
 * A typical user doc shape. Feel free to expand these fields
 * if you need more info in your analysis.
 */
interface UserDoc {
  birthday?: string;
  sex?: string;
  verified?: boolean;
  // Add any other fields you want to use
}

/**
 * Ensures a parent doc exists by writing minimal data.
 * If the doc already exists, this does nothing.
 */
export async function ensureDocExists(
    docRef: admin.firestore.DocumentReference
): Promise<void> {
  const snap = await docRef.get();
  if (!snap.exists) {
    await docRef.set({
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`Created missing doc: ${docRef.path}`);
  }
}

/**
 * Formats a Date object to "M_D_YYYY" (e.g. "6_22_2024")
 */
export function formatDateAsDocId(date: Date): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();
  return `${month}_${day}_${year}`;
}

/**
 * Generates a list of Saturdays (in "M_D_YYYY" format)
 * from June 22, 2024, up to today's date.
 */
export function getAllSaturdaysSinceJune22(): string[] {
  const start = new Date(2024, 5, 22); // June 22, 2024
  const today = new Date();

  // Reset time to midnight for both
  start.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  // Advance 'start' to the nearest Saturday if needed
  while (start.getDay() !== 6) {
    start.setDate(start.getDate() + 1);
  }

  const saturdays: string[] = [];
  const current = new Date(start);

  while (current <= today) {
    saturdays.push(formatDateAsDocId(current));
    current.setDate(current.getDate() + 7);
  }

  return saturdays;
}

/**
 * Returns the usage count threshold at the given percentile (0–100).
 * Assumes 'sortedArr' is sorted in ascending order.
 */
export function getPercentileValue(sortedArr: number[], percentile: number): number {
  if (sortedArr.length === 0) return 0;
  const p = Math.max(0, Math.min(100, percentile));
  // Use (length - 1) so 100th percentile picks the last item
  const idx = Math.floor((p / 100) * (sortedArr.length - 1));
  return sortedArr[idx];
}

/**
 * Calculates an approximate age from a birthday string like "MM/DD/YYYY".
 * Returns null if the format is invalid or incomplete.
 */
export function calculateAge(birthdayStr?: string): number | null {
  if (!birthdayStr) return null;

  const parts = birthdayStr.split("/");
  if (parts.length !== 3) return null;

  const [monthStr, dayStr, yearStr] = parts;
  const month = parseInt(monthStr, 10) - 1;
  const day = parseInt(dayStr, 10);
  const year = parseInt(yearStr, 10);

  if (isNaN(month) || isNaN(day) || isNaN(year)) return null;

  const birthDate = new Date(year, month, day);
  const today = new Date();

  let age = today.getFullYear() - birthDate.getFullYear();
  // If today's month/day is before the birthday month/day, subtract 1
  const hasHadBirthday =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());
  if (!hasHadBirthday) {
    age--;
  }

  return age;
}

/**
 * Computes the average for an array of numbers.
 */
export function avg(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

/**
 * Returns basic stats (min, max, average, median) for an array of numbers.
 */
export function getArrStats(arr: number[]): {
  min: number;
  max: number;
  avg: number;
  median: number;
} {
  if (arr.length === 0) {
    return {min: 0, max: 0, avg: 0, median: 0};
  }
  const sorted = [...arr].sort((a, b) => a - b);

  const minVal = sorted[0];
  const maxVal = sorted[sorted.length - 1];
  const averageVal = avg(sorted);

  let medianVal = 0;
  const m = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    medianVal = (sorted[m - 1] + sorted[m]) / 2;
  } else {
    medianVal = sorted[m];
  }

  return {
    min: minVal,
    max: maxVal,
    avg: averageVal,
    median: medianVal,
  };
}

/**
 * Main function that counts usage from grouped docs,
 * then fetches user data from the 'users' collection
 * to create a detailed stats report.
 */
export const countGroupedMembersStats = functions.pubsub
    .schedule("every 72 hours")
    .onRun(async () => {
      console.log("Starting to count grouped members.");

      // Keep track of how many times each user appears (usage)
      const userCounts: Record<string, number> = {};

      try {
      // Gather all Saturdays we care about
        const saturdayIds = getAllSaturdaysSinceJune22();
        console.log(`Found ${saturdayIds.length} Saturday(s) to check.`);

        // Loop through each Saturday
        for (const saturdayId of saturdayIds) {
          console.log(`--- Checking doc: '${saturdayId}' ---`);

          const weekDocRef = db.collection("grouped").doc(saturdayId);
          await ensureDocExists(weekDocRef);

          const cityRef = weekDocRef.collection("madison_wi");
          const locationDocRef = cityRef.doc("location");
          await ensureDocExists(locationDocRef);

          const coffeeShopCollections = await locationDocRef.listCollections();
          console.log(
              `Found ${coffeeShopCollections.length} coffee shop subcollection(s) for '${saturdayId}'.`
          );

          let totalMembersForWeek = 0;

          // For each coffee shop subcollection, gather all docs
          for (const coffeeShopCollection of coffeeShopCollections) {
            const coffeeShopDocs = await coffeeShopCollection.get();

            for (const coffeeShopDoc of coffeeShopDocs.docs) {
              const data = coffeeShopDoc.data() as GroupDocData;
              if (data.members && Array.isArray(data.members)) {
                totalMembersForWeek += data.members.length;

                // Count usage for each user
                data.members.forEach((member) => {
                  userCounts[member.id] = (userCounts[member.id] || 0) + 1;
                });
              }
            }
          }

          console.log(`For '${saturdayId}', total members = ${totalMembersForWeek}`);
        }

        // Now, compute overall usage stats
        const usageCounts = Object.values(userCounts);
        if (usageCounts.length === 0) {
          console.log("No user data found.");
          return;
        }

        usageCounts.sort((a, b) => a - b);

        const least = usageCounts[0];
        const most = usageCounts[usageCounts.length - 1];
        const sum = usageCounts.reduce((acc, val) => acc + val, 0);
        const averageUsage = sum / usageCounts.length;

        let medianUsage = 0;
        const mid = Math.floor(usageCounts.length / 2);
        if (usageCounts.length % 2 === 0) {
          medianUsage = (usageCounts[mid - 1] + usageCounts[mid]) / 2;
        } else {
          medianUsage = usageCounts[mid];
        }

        // Some percentile breakdowns
        const bottom25 = getPercentileValue(usageCounts, 25);
        const top25 = getPercentileValue(usageCounts, 75);
        const top10 = getPercentileValue(usageCounts, 90);
        const top5 = getPercentileValue(usageCounts, 95);

        // Find the user who used mesh the most
        let maxUid = "";
        let maxCount = 0;
        for (const [uid, count] of Object.entries(userCounts)) {
          if (count > maxCount) {
            maxCount = count;
            maxUid = uid;
          }
        }

      // We'll fetch user docs from the "users" collection for more detailed info
      interface EnrichedUser {
        uid: string;
        usageCount: number;
        age: number | null;
        sex: string | null;
        verified: boolean | null;
      }

      const enrichedUsers: EnrichedUser[] = [];
      const userFetchPromises = Object.keys(userCounts).map(async (uid) => {
        try {
          const userDoc = await db.collection("users").doc(uid).get();
          const userData = userDoc.data() as UserDoc | undefined;

          const usageCount = userCounts[uid];
          let age: number | null = null;
          let sex: string | null = null;
          let verified: boolean | null = null;

          if (userData) {
            age = calculateAge(userData.birthday);
            sex = userData.sex ?? null;
            verified = typeof userData.verified === "boolean" ? userData.verified : null;
          }

          enrichedUsers.push({
            uid,
            usageCount,
            age,
            sex,
            verified,
          });
        } catch (err) {
          console.error(`Error fetching user doc for uid '${uid}':`, err);
        }
      });

      await Promise.all(userFetchPromises);

      // Now we have 'enrichedUsers' for deeper analysis

      // We'll track usage by sex
      const sexStats: Record<string, number[]> = {};
      // Verified vs. non-verified
      const verifiedStats: number[] = [];
      const nonVerifiedStats: number[] = [];
      // Age brackets
      const ageBracketMap: Record<string, number[]> = {
        "<18": [],
        "18-24": [],
        "25-34": [],
        "35-44": [],
        "45-54": [],
        "55-64": [],
        "65+": [],
      };

      // Populate these arrays
      for (const user of enrichedUsers) {
        const userSex = user.sex || "unknown";
        if (!sexStats[userSex]) {
          sexStats[userSex] = [];
        }
        sexStats[userSex].push(user.usageCount);

        if (user.verified === true) {
          verifiedStats.push(user.usageCount);
        } else {
          nonVerifiedStats.push(user.usageCount);
        }

        // Age bracket
        if (user.age !== null) {
          let bracket = "";
          if (user.age < 18) bracket = "<18";
          else if (user.age <= 24) bracket = "18-24";
          else if (user.age <= 34) bracket = "25-34";
          else if (user.age <= 44) bracket = "35-44";
          else if (user.age <= 54) bracket = "45-54";
          else if (user.age <= 64) bracket = "55-64";
          else bracket = "65+";

          ageBracketMap[bracket].push(user.usageCount);
        }
      }

      // Now we can log all stats:

      console.log("=== Overall usage stats ===");
      console.log(`Least usage: ${least}`);
      console.log(`Most usage: ${most}`);
      console.log(`Average usage: ${averageUsage}`);
      console.log(`Median usage: ${medianUsage}`);
      console.log("Percentile thresholds:");
      console.log(`Bottom 25%: ${bottom25}`);
      console.log(`Top 25%: ${top25}`);
      console.log(`Top 10%: ${top10}`);
      console.log(`Top 5%: ${top5}`);
      console.log(`Highest usage user: ${maxUid} (count: ${maxCount})`);

      console.log("\n=== Sex-based stats ===");
      for (const [sex, arr] of Object.entries(sexStats)) {
        const stats = getArrStats(arr);
        console.log(
            `Sex: ${sex} => Count: ${arr.length}, Min: ${stats.min}, Max: ${stats.max}, Avg: ${stats.avg.toFixed(
                2
            )}, Median: ${stats.median}`
        );
      }

      console.log("\n=== Verified vs. Non-verified stats ===");
      const verifiedData = getArrStats(verifiedStats);
      console.log(
          `Verified: Count: ${verifiedStats.length}, Min: ${verifiedData.min}, Max: ${verifiedData.max}, Avg: ${verifiedData.avg.toFixed(
              2
          )}, Median: ${verifiedData.median}`
      );
      const nonVerifiedData = getArrStats(nonVerifiedStats);
      console.log(
          `Non-verified: Count: ${nonVerifiedStats.length}, Min: ${nonVerifiedData.min}, Max: ${nonVerifiedData.max}, Avg: ${nonVerifiedData.avg.toFixed(
              2
          )}, Median: ${nonVerifiedData.median}`
      );

      console.log("\n=== Age bracket stats ===");
      for (const [bracket, arr] of Object.entries(ageBracketMap)) {
        const bracketData = getArrStats(arr);
        console.log(
            `Age Bracket ${bracket}: Count: ${arr.length}, Min: ${bracketData.min}, Max: ${bracketData.max}, Avg: ${bracketData.avg.toFixed(
                2
            )}, Median: ${bracketData.median}`
        );
      }

      console.log("\nFinished counting members and creating a detailed report.");
      } catch (error) {
        console.error("Error in countGroupedMembers:", error);
      }
    });
