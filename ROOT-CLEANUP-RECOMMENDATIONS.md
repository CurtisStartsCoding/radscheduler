# Root Directory Cleanup Recommendations

**Date:** October 15, 2025
**Phase:** 5.2 (SMS-only, QIE middleware)

---

## ✅ KEEP (Production Files)

### Essential Configuration
- `.env.example` - Example environment config
- `.gitignore` - Git ignore rules
- `package.json` - Root package manager (UPDATE NEEDED - see below)
- `package-lock.json` - Lock file

### Active Scripts
- `deploy.sh` - Production deployment script (ACTIVE)
- `migrate.js` - Database migration utility (ACTIVE)

### Current Documentation
- `README.md` - Main documentation
- `PHASE-4-TESTING-PROGRESS.md` - Current testing report
- `REVERSE-PROXY-TEST-RESULTS.md` - Infrastructure test results
- `DEPLOYMENT.md` - Deployment guide
- `radscheduler-hardening-plan.md` - Architecture plan
- `SECURITY-REVIEW.md` - Security documentation

---

## 🗑️ DELETE (Obsolete Files)

### Build Artifacts (add to .gitignore)
- `radscheduler-deploy.tar.gz` - Build artifact
- `api.log` - Log file

### Docker Files (not used in Phase 5.2)
- `docker-compose.yml` - Old Docker setup
- `docker-compose.prod.yml` - Old Docker production setup

### Old Test Scripts (pre-Phase 5.2)
- `test-avreo-integration.js` - Old Avreo integration test
- `test-clinical-integration.js` - Old integration test
- `test-dual-scheduling.js` - Old dual scheduling test
- `test-modular-scheduling.js` - Old modular test
- `test-patient-booking.js` - Old booking test
- `test-patient-scheduling.js` - Old patient scheduling test
- `show-scheduling-config.js` - Old config display script

### Old Setup Scripts
- `setup.sh` - Old hackathon setup (replaced by deploy.sh)

### Cleanup Documentation (archive after review)
- `DOCUMENTATION-CLEANUP-SUMMARY.md` - Cleanup summary
- `LEGACY-DOCS-TO-DELETE-OR-UPDATE.md` - Cleanup guide

---

## ⚠️ SECURITY RISK

### CRITICAL: Remove from Repository
- `radscheduler-key.pem` - **SSH PRIVATE KEY - SHOULD NOT BE IN GIT!**
  - **Action:** Remove from git history
  - **Action:** Add `*.pem` to .gitignore
  - **Action:** Rotate this key if it's still in use

---

## 📝 UPDATE NEEDED

### package.json
Current package.json references obsolete components:
- References `web` folder (doesn't exist - no web UI in Phase 5.2)
- References `simulator` (doesn't exist)
- Docker commands (not used)
- Demo scenarios (not used)

**Recommended package.json:**
```json
{
  "name": "radscheduler",
  "version": "5.2.0",
  "description": "HIPAA-compliant SMS self-scheduling for radiology imaging",
  "scripts": {
    "setup": "cd api && npm install",
    "dev": "cd api && npm run dev",
    "deploy": "bash deploy.sh"
  },
  "keywords": [
    "healthcare",
    "sms",
    "scheduling",
    "radiology",
    "hipaa"
  ],
  "author": "RadScheduler",
  "license": "MIT"
}
```

---

## 📂 Proposed Final Root Structure

```
radscheduler/
├── .env.example
├── .gitignore
├── package.json (UPDATED)
├── deploy.sh
├── migrate.js
├── README.md
├── DEPLOYMENT.md
├── PHASE-4-TESTING-PROGRESS.md
├── REVERSE-PROXY-TEST-RESULTS.md
├── radscheduler-hardening-plan.md
├── SECURITY-REVIEW.md
├── api/          (application code)
└── docs/         (additional documentation)
```

---

## 🎯 Actions to Take

1. **URGENT:** Remove `radscheduler-key.pem` from git
   ```bash
   git rm radscheduler-key.pem
   git commit -m "security: Remove SSH private key from repository"
   echo "*.pem" >> .gitignore
   ```

2. **Delete obsolete files:**
   ```bash
   git rm docker-compose*.yml
   git rm test-*.js
   git rm show-scheduling-config.js
   git rm setup.sh
   git rm DOCUMENTATION-CLEANUP-SUMMARY.md
   git rm LEGACY-DOCS-TO-DELETE-OR-UPDATE.md
   git commit -m "chore: Remove obsolete pre-Phase 5.2 files"
   ```

3. **Update .gitignore:**
   ```bash
   echo "*.tar.gz" >> .gitignore
   echo "*.log" >> .gitignore
   echo "*.pem" >> .gitignore
   git add .gitignore
   git commit -m "chore: Update gitignore for build artifacts"
   ```

4. **Update package.json:**
   - Replace with simplified Phase 5.2 version
   - Remove obsolete dependencies

---

**Total Cleanup:** Remove 13 obsolete files, securing 1 critical file
