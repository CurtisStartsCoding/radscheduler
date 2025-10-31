/**
 * Generate RadScheduler CPT Duration Config
 *
 * Reads CPT codes from medical_cpt_codes.csv and generates a JSON config
 * mapping each CPT to its appointment duration based on modality
 *
 * Run: node scripts/generate-radscheduler-config.js
 */

const fs = require('fs');
const path = require('path');

// Modality durations (matches Mock RIS config)
const MODALITY_DURATIONS = {
  XRAY: 10,
  CT: 15,
  ULTRASOUND: 15,
  MAMMOGRAM: 15,
  DEXA: 20,
  MRI: 30,
  FLUOROSCOPY: 30,
  NUCLEAR: 60,
  PET: 60
};

/**
 * Map CPT code to modality (from Mock RIS modalities.ts logic)
 */
function mapCPTToModality(cptCode) {
  const code = parseInt(cptCode);

  // Radiology CPT codes: 70000-79999
  if (code >= 70000 && code <= 79999) {
    // CT scans: various ranges
    if (code >= 70450 && code <= 70498) return 'CT';
    if (code >= 71250 && code <= 71275) return 'CT';
    if (code >= 72125 && code <= 72133) return 'CT';
    if (code >= 72191 && code <= 72194) return 'CT';
    if (code >= 73200 && code <= 73206) return 'CT';
    if (code >= 73700 && code <= 73706) return 'CT';
    if (code >= 74150 && code <= 74178) return 'CT';
    if (code >= 74261 && code <= 74263) return 'CT';
    if (code >= 75571 && code <= 75574) return 'CT';

    // MRI scans: various ranges
    if (code >= 70540 && code <= 70559) return 'MRI';
    if (code >= 71550 && code <= 71552) return 'MRI';
    if (code >= 72141 && code <= 72159) return 'MRI';
    if (code >= 72195 && code <= 72197) return 'MRI';
    if (code >= 73218 && code <= 73223) return 'MRI';
    if (code >= 73718 && code <= 73723) return 'MRI';
    if (code >= 74181 && code <= 74183) return 'MRI';

    // Ultrasound: 76000-76999
    if (code >= 76000 && code <= 76999) return 'ULTRASOUND';

    // Nuclear Medicine: 78000-79999
    if (code >= 78000 && code <= 78999) return 'NUCLEAR';

    // PET scans: specific ranges
    if (code >= 78459 && code <= 78499) return 'PET';
    if (code >= 78608 && code <= 78609) return 'PET';
    if (code >= 78811 && code <= 78816) return 'PET';

    // Mammography: 77065-77067
    if (code >= 77065 && code <= 77067) return 'MAMMOGRAM';

    // DEXA / Bone Densitometry: 77080-77086
    if (code >= 77080 && code <= 77086) return 'DEXA';

    // Fluoroscopy/Angiography: various ranges
    if (code >= 75600 && code <= 75774) return 'FLUOROSCOPY';
    if (code >= 75791 && code <= 75893) return 'FLUOROSCOPY';

    // Default to X-ray for other radiology codes
    return 'XRAY';
  }

  // Non-radiology codes - check for common patterns
  if (code >= 93000 && code <= 93999) return 'ULTRASOUND'; // Cardiac/vascular ultrasound
  if (code >= 76000 && code <= 76999) return 'ULTRASOUND'; // General ultrasound

  // Default
  return 'XRAY';
}

/**
 * Check if CPT code likely uses contrast (heuristic)
 * Pattern: xxxX0 where X is the last digit before 0
 * x50 = without contrast
 * x60 = with contrast
 * x70 = without and with contrast
 */
function hasContrast(cptCode) {
  const code = parseInt(cptCode);

  if (code >= 70000 && code <= 79999) {
    const lastTwoDigits = code % 100;
    const tensDigit = Math.floor(lastTwoDigits / 10);

    // x60, x70 patterns typically indicate contrast use
    if (tensDigit === 6 || tensDigit === 7) {
      return true;
    }
  }

  return false;
}

/**
 * Generate config for all CPT codes
 */
function generateConfig() {
  const csvPath = path.join(__dirname, '../redis-parser-development/postgres-data/medical_cpt_codes.csv');

  if (!fs.existsSync(csvPath)) {
    console.error('❌ CPT codes CSV not found:', csvPath);
    process.exit(1);
  }

  // Read CSV and extract CPT codes
  const csv = fs.readFileSync(csvPath, 'utf8');
  const lines = csv.split('\n');
  const cptCodes = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cptCode = line.split(',')[0];
    if (cptCode) {
      cptCodes.push(cptCode);
    }
  }

  console.log(`📋 Processing ${cptCodes.length} CPT codes...`);

  // Generate CPT → duration mapping
  const cptDurations = {};
  const stats = {};

  for (const cptCode of cptCodes) {
    const modality = mapCPTToModality(cptCode);
    let duration = MODALITY_DURATIONS[modality] || 30;

    // Add extra time for contrast procedures
    if (hasContrast(cptCode) && (modality === 'CT' || modality === 'MRI')) {
      duration = modality === 'CT' ? 30 : 45; // CT with contrast: 30 min, MRI with contrast: 45 min
    }

    cptDurations[cptCode] = duration;

    // Track stats
    stats[modality] = (stats[modality] || 0) + 1;
  }

  console.log('\n📊 CPT Code Distribution by Modality:');
  Object.entries(stats).sort((a, b) => b[1] - a[1]).forEach(([mod, count]) => {
    console.log(`  ${mod}: ${count} codes`);
  });

  // Generate config
  const config = {
    radiology_regional: {
      name: "Radiology Regional",
      organization_id: null, // Will be set at runtime

      // Individual CPT code durations
      cpt_durations: cptDurations,

      // Stacking rules: How to handle multiple procedures of same modality
      // "sum" = Add all procedure durations together
      // "max" = Use the longest single procedure duration
      stacking_rules: {
        CT: "sum",           // Conservative: 3 CTs @ 15min = 45min total
        MRI: "sum",          // Conservative: MRIs take time
        XRAY: "max",         // Efficient: X-rays are fast, use longest
        ULTRASOUND: "sum",   // Conservative: Start safe
        MAMMOGRAM: "max",    // Efficient: Usually done together
        DEXA: "max",         // Single procedure typically
        NUCLEAR: "sum",      // Conservative: Nuclear med takes time
        PET: "sum",          // Conservative: PET scans are lengthy
        FLUOROSCOPY: "sum"   // Conservative: Fluoroscopy procedures vary
      }
    }
  };

  // Write config file
  const outputPath = path.join(__dirname, '../radscheduler-config/radiology-groups.json');
  const outputDir = path.dirname(outputPath);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(config, null, 2));

  console.log(`\n✅ Generated config: ${outputPath}`);
  console.log(`📍 Total CPT codes: ${Object.keys(cptDurations).length}`);
  console.log(`\nSample mappings:`);
  console.log(`  70450 (CT without contrast): ${cptDurations['70450']} min`);
  console.log(`  70460 (CT with contrast): ${cptDurations['70460']} min`);
  console.log(`  70551 (MRI brain): ${cptDurations['70551']} min`);
  console.log(`  71046 (Chest X-ray): ${cptDurations['71046']} min`);
  console.log(`  76705 (Ultrasound abdomen): ${cptDurations['76705']} min`);
}

// Run
try {
  generateConfig();
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
