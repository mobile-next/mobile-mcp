#!/usr/bin/env bash
# Guard against hardcoded PostHog project tokens being committed to source.
# Tokens are at least 20 characters after "phc_", which avoids matching
# placeholder text like phc_xxx or phc_YOUR_TOKEN used in documentation.
set -euo pipefail

SEARCH_PATHS=(src test package.json package-lock.json README.md CHANGELOG.md)

if grep -rniE 'phc_[a-zA-Z0-9_-]{20,}' "${SEARCH_PATHS[@]}" 2>/dev/null; then
	echo ""
	echo "ERROR: Hardcoded PostHog project token found in source."
	echo "Remove the token and require users to supply their own via MOBILEMCP_POSTHOG_PROJECT_TOKEN."
	exit 1
fi

echo "OK: No hardcoded PostHog tokens found."
