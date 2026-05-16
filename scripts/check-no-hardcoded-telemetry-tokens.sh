#!/usr/bin/env bash
# Guard against hardcoded PostHog project tokens being committed to source.
# Tokens are at least 20 characters after "phc_", which avoids matching
# placeholder text like phc_xxx or phc_YOUR_TOKEN used in documentation.
set -euo pipefail

SEARCH_PATHS=(src test package.json package-lock.json README.md CHANGELOG.md)

# Validate that every entry in SEARCH_PATHS exists and is readable before
# running grep; a missing path would otherwise cause grep to silently exit 2
# (error) while 2>/dev/null hides it, making the guard pass falsely.
for path in "${SEARCH_PATHS[@]}"; do
	if [[ ! -e "$path" ]]; then
		echo "ERROR: check-no-hardcoded-telemetry-tokens: required path does not exist: $path" >&2
		exit 2
	fi
	if [[ ! -r "$path" ]]; then
		echo "ERROR: check-no-hardcoded-telemetry-tokens: required path is not readable: $path" >&2
		exit 2
	fi
done

# grep exit codes: 0 = match found, 1 = no match, 2 = error.
# We must not suppress stderr so that grep errors (e.g. permission denied on a
# file inside a directory) surface immediately rather than silently passing.
# The "|| true" prevents set -e from aborting on exit code 1 (no match);
# we capture the real code in grep_exit and handle all three cases explicitly.
grep -rniE 'phc_[a-zA-Z0-9_-]{20,}' "${SEARCH_PATHS[@]}" || grep_exit=$?
grep_exit=${grep_exit:-0}

if [[ $grep_exit -eq 0 ]]; then
	echo ""
	echo "ERROR: Hardcoded PostHog project token found in source."
	echo "Remove the token and require users to supply their own via MOBILEMCP_POSTHOG_PROJECT_TOKEN."
	exit 1
elif [[ $grep_exit -eq 1 ]]; then
	echo "OK: No hardcoded PostHog tokens found."
else
	echo "ERROR: check-no-hardcoded-telemetry-tokens: grep encountered an error (exit $grep_exit)." >&2
	exit "$grep_exit"
fi
