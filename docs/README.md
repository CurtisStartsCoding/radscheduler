# RadScheduler Documentation Index

**Version:** Phase 5.2
**Last Updated:** October 15, 2025
**Architecture:** SMS Self-Scheduling with QIE Middleware Integration

---

## 📖 Getting Started

For project overview, quick start, and features, see the **[Main README](../README.md)** in the root directory.

---

## 📚 Documentation

### Architecture & Planning
- **[Architecture Hardening Plan](architecture-hardening-plan.md)** - Complete security and architecture hardening plan for Phase 5.2, including implementation details and Phase 5.2 vs old architecture comparison

### Deployment & Operations
- **[Deployment Guide](deployment-guide.md)** - Production deployment using bash script, EC2, PM2, and nginx reverse proxy. Includes troubleshooting and rollback procedures
- **[Security Review](security-review.md)** - Current security status, completed hardening tasks, and infrastructure setup

### Reports & Testing
- **[Phase 4 Testing Progress](reports/phase-4-testing.md)** - Complete testing report with all features verified (SMS flow, consent, audit logging, webhooks)
- **[Reverse Proxy Test Results](reports/reverse-proxy-tests.md)** - Infrastructure testing and nginx reverse proxy verification
- **[Dependency Audit (2025-10-15)](audits/2025-10-15-dependency-audit.md)** - Dependency cleanup report, security audit results, and production readiness assessment

### AI Assessment Roles
- **[Senior SWE Role](roles/senior_swe_role.md)** - Senior software engineer assessment role
- **[AI Senior Manager Role](roles/ai_senior_manager_role.md)** - AI senior manager assessment role
- **[HIPAA/SOC2 Auditor Role](roles/hipaa-soc2-auditor-role.md)** - HIPAA and SOC2 auditor assessment role

---

## 🎯 Quick Reference

### Current Production Status
- **Infrastructure:** ✅ Complete (EC2, nginx, SSL, PM2)
- **Database:** ✅ PostgreSQL with HIPAA-compliant schema
- **SMS Flow:** ✅ Working (consent, conversation, audit logging)
- **Security:** ✅ Rate limiting, webhook verification, hashed phone numbers
- **Pending:** QIE/RIS integration, Twilio A2P 10DLC registration

### Key Technologies
- **Backend:** Node.js, Express, PostgreSQL
- **SMS:** Twilio with HIPAA BAA
- **Integration:** QIE (Qvera Interface Engine) for RIS communication
- **Deployment:** EC2, nginx reverse proxy, PM2 process manager
- **Security:** Helmet, rate limiting, input validation, phone number hashing

---

## 🔗 External Documentation

### Related Projects
- **Phase 5.2 Specification:** `../../radorderpad-api/final-documentation/qvera/phase-5.2-radscheduler-sms-epic.md`
- **QIE Tutorial:** `../../radorderpad-api/final-documentation/qvera/qie-tutorial.txt`
- **QIE JavaScript Tutorial:** `../../radorderpad-api/final-documentation/qvera/qie-javascript-tutorial.txt`

### Vendor Documentation
- [Twilio HIPAA Compliance](https://www.twilio.com/docs/usage/hipaa)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Qvera Interface Engine (QIE)](https://www.qvera.com/)

---

## 📝 Documentation Standards

All documentation follows these principles:
- **Current:** Phase 5.2 architecture (SMS-only, QIE middleware, PostgreSQL-only)
- **Accurate:** Reflects actual production deployment (not theoretical)
- **Dated:** Point-in-time reports include dates in filename
- **Organized:** Grouped by purpose (architecture, deployment, reports, audits)

---

**For detailed project information, see [Main README](../README.md)**
