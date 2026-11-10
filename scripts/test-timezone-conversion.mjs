import assert from "node:assert";

// Implementations matching src/lib/utils.ts
function zonedLocalToUtcIso(localIsoString, timeZone = "America/New_York") {
  if (!localIsoString) return "";
  try {
    const [datePart, timePart] = localIsoString.split("T");
    if (!datePart) return "";
    const [year, month, day] = datePart.split("-").map(Number);
    const [hours, minutes] = (timePart || "00:00").split(":").map(Number);

    let guessUtc = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);

    const getOffset = (utcMillis) => {
      const d = new Date(utcMillis);
      const dtf = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      });
      const parts = Object.fromEntries(
        dtf.formatToParts(d).map((p) => [p.type, p.value])
      );
      const localTimeMillis = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
        Number(parts.second)
      );
      return localTimeMillis - utcMillis;
    };

    for (let i = 0; i < 3; i++) {
      const offset = getOffset(guessUtc);
      const targetLocal = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);
      const diff = targetLocal - (guessUtc + offset);
      if (Math.abs(diff) < 1000) break;
      guessUtc += diff;
    }

    return new Date(guessUtc).toISOString();
  } catch (err) {
    console.error("Failed to convert zoned local to UTC:", err);
    return "";
  }
}

function utcIsoToZonedLocal(utcIsoString, timeZone = "America/New_York") {
  if (!utcIsoString) return "";
  try {
    const d = new Date(utcIsoString);
    if (Number.isNaN(d.getTime())) return "";

    const dtf = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const parts = Object.fromEntries(
      dtf.formatToParts(d).map((p) => [p.type, p.value])
    );
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  } catch (err) {
    console.error("Failed to convert UTC to zoned local:", err);
    return "";
  }
}

console.log("--- Testing Timezone Conversions ---");

// Test 1: Requested deadline December 1, 2026, 11:59 PM America/New_York
const targetLocal = "2026-12-01T23:59";
const targetUtc = zonedLocalToUtcIso(targetLocal, "America/New_York");
console.log(`Test 1: ${targetLocal} EST -> UTC:`, targetUtc);
assert.strictEqual(targetUtc, "2026-12-02T04:59:00.000Z", "Target UTC must be 2026-12-02T04:59:00.000Z");

const targetRoundTrip = utcIsoToZonedLocal(targetUtc, "America/New_York");
console.log(`Test 1 Round-trip: UTC -> EST:`, targetRoundTrip);
assert.strictEqual(targetRoundTrip, targetLocal, "Round trip must preserve 2026-12-01T23:59");

// Test 2: Daylight Saving Time (July 1, 2026, 12:00 PM America/New_York is UTC-4)
const summerLocal = "2026-07-01T12:00";
const summerUtc = zonedLocalToUtcIso(summerLocal, "America/New_York");
console.log(`Test 2 (EDT): ${summerLocal} -> UTC:`, summerUtc);
assert.strictEqual(summerUtc, "2026-07-01T16:00:00.000Z", "EDT in July is UTC-4 (12:00 local = 16:00 UTC)");
assert.strictEqual(utcIsoToZonedLocal(summerUtc, "America/New_York"), summerLocal);

// Test 3: Midnight boundary (Nov 1, 2026, 00:00)
const midnightLocal = "2026-11-01T00:00";
const midnightUtc = zonedLocalToUtcIso(midnightLocal, "America/New_York");
console.log(`Test 3: ${midnightLocal} -> UTC:`, midnightUtc);
assert.strictEqual(utcIsoToZonedLocal(midnightUtc, "America/New_York"), midnightLocal);

console.log("All timezone unit tests PASSED successfully!");

