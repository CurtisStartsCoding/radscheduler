# Smart Grouping & Appointment Stacking Guide

**Version:** 1.0
**Date:** October 31, 2025
**Purpose:** Configure how RadScheduler handles multi-procedure orders for optimal slot utilization

---

## Table of Contents
1. [Overview](#overview)
2. [How It Works](#how-it-works)
3. [Configuration](#configuration)
4. [Evolution Path](#evolution-path)
5. [Making Tweaks](#making-tweaks)
6. [Examples](#examples)
7. [Troubleshooting](#troubleshooting)

---

## Overview

### The Problem
When a physician orders multiple imaging procedures (e.g., 3 CT scans), how much appointment time should we book?

**Naive approach:** 3 CTs × 15 min = 45 minutes
**Reality:** Modern equipment (like Radiology Regional's SOMATOM Force 256-slice CT) can complete multiple body parts in one 15-20 minute session.

### The Solution: Smart Grouping
RadScheduler groups procedures by modality and uses **configurable stacking rules** to calculate required appointment duration.

**Key Benefits:**
- ✅ **Flexible:** Start conservative, optimize over time
- ✅ **Configurable:** No code changes needed
- ✅ **Data-driven:** Adjust based on real-world patterns
- ✅ **Per-modality:** CT rules differ from MRI rules

---

## How It Works

### Step 1: Group by Modality
When an order arrives, RadScheduler groups procedures by imaging modality:

```javascript
Order CPT Codes: [70450, 70460, 71046]

Grouped:
{
  CT: [
    { code: "70450", duration: 15 },   // CT head without contrast
    { code: "70460", duration: 30 }    // CT head with contrast
  ],
  XRAY: [
    { code: "71046", duration: 10 }    // Chest X-ray
  ]
}
```

### Step 2: Apply Stacking Rules
For each modality group, apply the configured stacking rule:

**Rule: "sum" (Conservative)**
```javascript
CT group: 15 + 30 = 45 minutes needed
```

**Rule: "max" (Efficient)**
```javascript
CT group: max(15, 30) = 30 minutes needed
```

### Step 3: Filter Available Slots
Find slots that meet or exceed the required duration:

```javascript
// For CT group needing 45 minutes
const suitableSlots = allSlots.filter(slot =>
  slot.modality === 'CT' &&
  slot.durationMinutes >= 45
);
```

### Step 4: Present to Patient
Patient sees grouped appointments:
- **CT Scan (2 procedures)** - Select time
- **X-Ray (1 procedure)** - Select time

---

## Configuration

### File Location
`radscheduler-config/radiology-groups.json`

### Structure
```json
{
  "radiology_regional": {
    "name": "Radiology Regional",
    "organization_id": null,

    "cpt_durations": {
      "70450": 15,
      "70460": 30,
      ...
    },

    "stacking_rules": {
      "CT": "sum",
      "MRI": "sum",
      "XRAY": "max",
      "ULTRASOUND": "sum",
      "MAMMOGRAM": "max",
      "DEXA": "max",
      "NUCLEAR": "sum",
      "PET": "sum",
      "FLUOROSCOPY": "sum"
    }
  }
}
```

### Stacking Rule Options

| Rule | Behavior | Use Case |
|------|----------|----------|
| `"sum"` | Add all procedure durations | Conservative, ensures enough time |
| `"max"` | Use longest procedure duration | Efficient, for fast equipment |

---

## Evolution Path

### Phase 1: Conservative Start (CURRENT)
**Goal:** Ensure we never under-book appointment time

```json
{
  "stacking_rules": {
    "CT": "sum",        // Safe: 3 CTs = 45 min
    "MRI": "sum",       // Safe: 2 MRIs = 60 min
    "XRAY": "max",      // Already fast
    "ULTRASOUND": "sum" // Conservative
  }
}
```

**When to use:**
- Initial deployment
- No real-world data yet
- Unknown equipment speed
- Risk-averse approach

### Phase 2: Optimize Based on Data (3-6 months)
**Goal:** Increase slot utilization without compromising patient experience

**Data to collect:**
- Average appointment duration vs. booked time
- Patient wait times
- Technologist feedback
- Equipment utilization rates

**Example optimizations:**
```json
{
  "stacking_rules": {
    "CT": "max",        // ← CHANGED! Data shows modern CT is fast
    "MRI": "sum",       // Still conservative (MRIs take time)
    "XRAY": "max",
    "ULTRASOUND": "max" // ← CHANGED! After observing patterns
  }
}
```

### Phase 3: Advanced Optimization (Future)
**Goal:** Fine-tuned per-procedure stacking

```json
{
  "stacking_rules": {
    "CT": {
      "mode": "formula",
      "base_minutes": 15,
      "per_additional_procedure": 5
    }
  }
}
```
*Example: 3 CTs = 15 + (2 × 5) = 25 minutes*

**Note:** This requires RadScheduler code changes. Phase 1 & 2 are JSON-only updates.

---

## Making Tweaks

### Scenario 1: CTs are booking too much time
**Symptom:** Patients finishing early, slots underutilized
**Solution:** Change CT from "sum" to "max"

**Before:**
```json
"CT": "sum"  // 3 CTs @ 15min = 45min
```

**After:**
```json
"CT": "max"  // 3 CTs = 15min (longest procedure)
```

**Deployment:**
1. Edit `radscheduler-config/radiology-groups.json`
2. SSH to server: `ssh ubuntu@3.21.14.188`
3. Restart RadScheduler: `pm2 restart radscheduler`
4. Monitor for 1-2 weeks

### Scenario 2: MRIs running over time
**Symptom:** Patients delayed, appointments backing up
**Solution:** Keep MRI as "sum" or increase individual durations

**Option A: Keep conservative stacking**
```json
"MRI": "sum"  // Already using this, maybe durations are wrong?
```

**Option B: Increase base MRI durations**
```json
"cpt_durations": {
  "70551": 35,  // Was 30, now 35
  "70552": 35   // Was 30, now 35
}
```

**Deployment:**
1. Regenerate config: `node scripts/generate-radscheduler-config.js`
2. Or manually edit `radiology-groups.json`
3. Deploy and restart RadScheduler

### Scenario 3: X-rays occasionally need more time
**Symptom:** Some X-ray appointments run long
**Solution:** Change X-ray from "max" to "sum"

**Before:**
```json
"XRAY": "max"  // 5 X-rays = 10min (fastest one)
```

**After:**
```json
"XRAY": "sum"  // 5 X-rays @ 10min = 50min
```

---

## Examples

### Example 1: Simple CT Order
**Order:** 70450 (CT head without contrast)

```javascript
Groups: { CT: [15] }
Stacking rule: "sum"
Required duration: 15 minutes

Slots shown: CT slots ≥ 15 min
```

### Example 2: Multi-CT Order (Current Config)
**Order:** 70450, 70460, 74150 (CT head without, head with, abdomen)

```javascript
Groups: { CT: [15, 30, 15] }
Stacking rule: "sum"
Required duration: 15 + 30 + 15 = 60 minutes

Slots shown: CT slots ≥ 60 min
```

### Example 3: Multi-CT Order (After Optimization)
**Order:** Same as Example 2

```javascript
Groups: { CT: [15, 30, 15] }
Stacking rule: "max"  // ← Changed!
Required duration: max(15, 30, 15) = 30 minutes

Slots shown: CT slots ≥ 30 min
```

**Result:** More slots available, better utilization

### Example 4: Mixed Modality Order
**Order:** 70450, 70460, 71046 (2 CTs + 1 X-ray)

```javascript
Groups: {
  CT: [15, 30],
  XRAY: [10]
}

Stacking rules: CT="sum", XRAY="max"
Required durations:
  - CT: 45 minutes
  - XRAY: 10 minutes

Patient books 2 separate appointments:
  1. CT appointment (2 procedures)
  2. X-ray appointment (1 procedure)
```

---

## Troubleshooting

### Issue: Config changes not taking effect
**Check:**
1. JSON syntax valid? Use `node -e "require('./radscheduler-config/radiology-groups.json')"`
2. RadScheduler restarted? `pm2 restart radscheduler`
3. Correct file path? RadScheduler loads from `config/radiology-groups.json`

### Issue: Patients reporting insufficient time
**Immediate fix:**
1. Switch modality to "sum" stacking
2. Increase base CPT durations by 5-10 min

**Long-term:**
1. Collect appointment duration data
2. Analyze patterns per modality
3. Adjust systematically

### Issue: Too many slots showing "unavailable"
**Likely cause:** Required durations too long, not enough large slots

**Solutions:**
1. Switch to "max" stacking for fast modalities
2. Add more long-duration slots in Mock RIS
3. Review if base CPT durations are accurate

---

## Deployment Checklist

When updating stacking rules:

- [ ] Backup current config: `cp radiology-groups.json radiology-groups.json.backup`
- [ ] Edit stacking_rules section
- [ ] Validate JSON syntax
- [ ] Test in staging/dev environment if available
- [ ] Deploy to production server
- [ ] Restart RadScheduler service
- [ ] Monitor appointment bookings for 48 hours
- [ ] Check patient feedback
- [ ] Adjust if needed

---

## Questions or Issues?

**Contact:** Development Team
**Documentation:** `radscheduler-config/SMART-GROUPING-GUIDE.md`
**Config Generator:** `scripts/generate-radscheduler-config.js`

**Always test changes in a non-production environment first!**
