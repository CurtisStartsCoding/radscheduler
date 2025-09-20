#!/bin/bash

# Test Multi-Tenant Features Locally
# Run this after setup to verify everything works

echo "========================================="
echo "Testing Multi-Tenant Features"
echo "========================================="

API_URL="http://localhost:3010"

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test function
test_endpoint() {
    local name=$1
    local method=$2
    local url=$3
    local data=$4
    local headers=$5

    echo ""
    echo "Testing: $name"
    echo "-----------------------------------"

    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" $headers "$url")
    else
        response=$(curl -s -w "\n%{http_code}" -X $method $headers -H "Content-Type: application/json" -d "$data" "$url")
    fi

    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    if [[ $http_code -ge 200 && $http_code -lt 300 ]]; then
        echo -e "${GREEN}✅ Success (HTTP $http_code)${NC}"
        echo "$body" | python -m json.tool 2>/dev/null || echo "$body"
    else
        echo -e "${RED}❌ Failed (HTTP $http_code)${NC}"
        echo "$body"
    fi
}

# 1. Test Health Check
test_endpoint "Health Check" "GET" "$API_URL/health"

# 2. Test creating an organization (without auth for now)
test_endpoint "Create Organization" "POST" "$API_URL/api/organizations" \
    '{"slug": "test-clinic", "name": "Test Clinic"}' \
    ""

# 3. Test getting organization
test_endpoint "Get Default Organization" "GET" "$API_URL/api/organizations/default" \
    "" ""

# 4. Test Voice Integration Health
test_endpoint "Voice Integration Health" "GET" "$API_URL/api/voice/health" \
    "" "-H 'Authorization: Bearer test-key'"

# 5. Test appointments with org context
test_endpoint "Get Appointments (with org header)" "GET" "$API_URL/api/appointments" \
    "" "-H 'X-Organization-Slug: default'"

echo ""
echo "========================================="
echo "Testing Complete!"
echo "========================================="
echo ""
echo "Summary:"
echo "- If you see 401/403 errors, authentication is working correctly"
echo "- If you see 200 responses, the endpoints are accessible"
echo "- Check the API logs for tenant resolution messages"
echo ""
echo "To test with authentication:"
echo "1. Login: curl -X POST $API_URL/api/auth/login -d '{\"email\":\"admin@radscheduler.com\",\"password\":\"password\"}'"
echo "2. Use the returned token in Authorization header"
echo ""