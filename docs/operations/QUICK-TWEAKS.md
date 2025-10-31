# Quick Config Tweaks - Cheat Sheet

**File:** `radscheduler-config/radiology-groups.json`

---

## Common Adjustments

### 1. CT Scans Running Too Short → Change to "max"
```json
"CT": "max"  // 3 CTs = longest procedure (not sum)
```

### 2. MRI Scans Running Over → Keep "sum" or increase durations
```json
"MRI": "sum"  // Keep adding durations together
```

OR increase individual MRI durations in `cpt_durations` section.

### 3. X-rays Need More Time → Change to "sum"
```json
"XRAY": "sum"  // Add all X-ray durations
```

### 4. Ultrasounds Too Long → Change to "max"
```json
"ULTRASOUND": "max"  // Use longest ultrasound only
```

---

## Deployment Steps

### Quick Update (Production)
```bash
# 1. SSH to server
ssh ubuntu@3.21.14.188

# 2. Edit config
nano ~/radscheduler/config/radiology-groups.json

# 3. Validate JSON
node -e "require('./radscheduler/config/radiology-groups.json')"

# 4. Restart RadScheduler
pm2 restart radscheduler

# 5. Check logs
pm2 logs radscheduler --lines 50
```

### Regenerate Full Config (Local)
```bash
# 1. Edit scripts/generate-radscheduler-config.js
# 2. Run generator
node scripts/generate-radscheduler-config.js

# 3. Copy to server
scp radscheduler-config/radiology-groups.json ubuntu@3.21.14.188:~/radscheduler/config/

# 4. Restart RadScheduler
ssh ubuntu@3.21.14.188 "pm2 restart radscheduler"
```

---

## Validation

**Before deploying, always validate JSON:**
```bash
node -e "require('./radscheduler-config/radiology-groups.json')"
```

**Good output:** (nothing = valid JSON)
**Bad output:** `SyntaxError: Unexpected token...`

---

## Rollback

**If something breaks:**
```bash
# Restore backup
cp radiology-groups.json.backup radiology-groups.json

# Restart
pm2 restart radscheduler
```

**Always backup before changes:**
```bash
cp radiology-groups.json radiology-groups.json.backup
```

---

## Evolution Timeline

| Phase | Timeframe | Strategy | Rules |
|-------|-----------|----------|-------|
| **1** | Months 1-3 | Conservative | Most = "sum" |
| **2** | Months 4-6 | Data-driven optimization | Fast modalities → "max" |
| **3** | Month 7+ | Fine-tuning | Per-facility adjustments |

---

## Need Help?

See full documentation: `SMART-GROUPING-GUIDE.md`
