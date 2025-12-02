/**
 * Reseed Mock RIS Appointment Slots
 *
 * Run this script on the QIE server (10.0.1.211) when slots expire.
 * Generates 30 days of appointment slots for all active locations.
 *
 * Usage (on QIE server):
 *   cd ~/mock-ris && node reseed-mock-ris-slots.js
 *
 * Or copy to server and run:
 *   scp scripts/reseed-mock-ris-slots.js ubuntu@10.0.1.211:~/mock-ris/
 *   ssh ubuntu@10.0.1.211 'cd ~/mock-ris && node reseed-mock-ris-slots.js'
 */

const Database = require("better-sqlite3");
const db = new Database("./mock-ris.db");

const MODALITY_DURATIONS = {
  XRAY: 10, CT: 15, ULTRASOUND: 15, MAMMOGRAM: 15,
  DEXA: 20, MRI: 30, FLUOROSCOPY: 30, NUCLEAR: 60, PET: 60
};

console.log("🌱 Seeding appointment slots...");

// Disable foreign key constraints for bulk delete
db.pragma("foreign_keys = OFF");

const dbLocations = db.prepare("SELECT id, location_id, name, modalities FROM locations WHERE active = 1").all();
console.log("📍 Found", dbLocations.length, "locations");

const deleted = db.prepare("DELETE FROM appointment_slots").run().changes;
console.log("🗑️  Cleared", deleted, "existing slots");

// Re-enable foreign keys
db.pragma("foreign_keys = ON");

const insert = db.prepare(`
  INSERT INTO appointment_slots (
    location_id, location_name, modality, slot_datetime,
    duration_minutes, resource_type, resource_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`);

let count = 0;
const now = new Date();
const oneHourFromNow = new Date(now.getTime() + 60*60*1000);

for (let day = 0; day < 30; day++) {
  const date = new Date(now);
  date.setDate(date.getDate() + day);

  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) continue; // Skip weekends

  for (const dbLoc of dbLocations) {
    const modalities = dbLoc.modalities.split(",").map(m => m.trim());

    for (const modality of modalities) {
      const duration = MODALITY_DURATIONS[modality] || 30;

      for (let hour = 8; hour < 17; hour++) {
        const intervals = duration === 10 ? [0,10,20,30,40,50] :
                         duration === 15 ? [0,15,30,45] : [0,30];

        for (const minute of intervals) {
          const slotEnd = hour * 60 + minute + duration;
          if (slotEnd > 17 * 60) continue; // Don't exceed 5 PM

          const slotDate = new Date(date);
          slotDate.setHours(hour, minute, 0, 0);

          if (slotDate < oneHourFromNow) continue; // Skip past slots

          insert.run(
            dbLoc.location_id,  // CRITICAL: Use location_id (RR-XXX), not numeric id
            dbLoc.name,
            modality,
            slotDate.toISOString(),
            duration,
            "Equipment",
            dbLoc.location_id
          );
          count++;
        }
      }
    }
  }
}

console.log("✅ Seeded", count, "appointment slots");

const result = db.prepare("SELECT MIN(slot_datetime) as min, MAX(slot_datetime) as max FROM appointment_slots").get();
console.log("📅 Date range:", result.min.substring(0,10), "to", result.max.substring(0,10));

// Verify the JOIN works correctly
const testQuery = db.prepare(`
  SELECT COUNT(DISTINCT l.location_id) as count
  FROM locations l
  JOIN appointment_slots s ON l.location_id = s.location_id
  WHERE l.active = 1 AND s.modality = 'CT' AND s.available = 1
`).get();
console.log("✅ Verification: CT modality has", testQuery.count, "locations available");

db.close();
