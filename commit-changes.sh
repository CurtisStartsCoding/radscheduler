#!/bin/bash

# Helper script to commit changes in organized groups
# Run this to commit your changes in a clean, organized way

echo "========================================="
echo "RadScheduler - Organized Commit Helper"
echo "========================================="

# Function to show files and confirm
confirm_commit() {
    local commit_name=$1
    echo ""
    echo "Files to commit for: $commit_name"
    echo "-----------------------------------"
    git status --short | grep -E "$2"
    echo ""
    read -p "Commit these files? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        return 0
    else
        return 1
    fi
}

# Commit 1: Multi-Tenant Architecture
echo ""
echo "=== COMMIT 1: Multi-Tenant Architecture ==="

if confirm_commit "Multi-Tenant Architecture" "repositories|organization|tenant|adapter|configuration-provider|001-|002-|003-|MULTI_TENANT|SRP_"; then
    git add api/src/repositories/
    git add api/src/services/organization.service.js
    git add api/src/services/configuration-provider.js
    git add api/src/middleware/tenant-*.js
    git add api/src/adapters/
    git add api/src/routes/organizations.js
    git add api/scripts/*.sql
    git add docs/MULTI_TENANT_*.md
    git add docs/SRP_*.md

    git commit -m "feat: Add multi-tenant architecture with SRP design

- Add repository layer for data access (organizations, settings)
- Add service layer for business logic
- Add middleware for tenant resolution and context
- Add RIS adapter pattern for multiple systems
- Add database migrations for organizations
- Add comprehensive documentation

This enables multiple radiology organizations to use the platform
with complete data isolation and custom configurations."

    echo "✅ Multi-tenant architecture committed!"
fi

# Commit 2: Voice AI System
echo ""
echo "=== COMMIT 2: Voice AI System (Separate) ==="

if confirm_commit "Voice AI System" "voice-ai-booking|aws-connect|voice-integration|AWS_CONNECT"; then
    git add voice-ai-booking/
    git add aws-connect/
    git add api/src/routes/voice-integration.js
    git add docs/AWS_CONNECT_*.md
    git add api/src/server.js  # Has the 2-line change for voice

    git commit -m "feat: Add separate Voice AI booking system

- Add completely independent voice infrastructure
- Add AWS Connect and Lex bot configurations
- Add Lambda functions with PHI redaction
- Add minimal API integration (1 file + 2 lines)
- Add comprehensive AWS setup documentation

Voice system is completely separate and communicates only via API.
Can be removed by deleting voice-ai-booking/ and removing 2 lines."

    echo "✅ Voice AI system committed!"
fi

# Commit 3: Documentation and helpers
echo ""
echo "=== COMMIT 3: Documentation and Setup Scripts ==="

if confirm_commit "Documentation" "roles/|prd|setup-multi|commit-changes"; then
    git add docs/roles/
    git add "docs/prd and implementation plan.md"
    git add setup-multi-tenant-local.sh
    git add commit-changes.sh

    git commit -m "docs: Add role documentation and setup helpers

- Add role definitions for team members
- Add PRD and implementation plan
- Add local setup script for multi-tenant
- Add commit helper script"

    echo "✅ Documentation committed!"
fi

echo ""
echo "========================================="
echo "All commits complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Test locally: ./setup-multi-tenant-local.sh"
echo "2. Push to repository: git push"
echo "3. Deploy voice to AWS: cd voice-ai-booking && ./infrastructure/setup-voice-infrastructure.sh"
echo ""