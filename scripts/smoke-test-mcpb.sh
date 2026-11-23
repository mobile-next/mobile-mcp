#!/usr/bin/env bash
# Unpacks a .mcpb the way Claude Desktop does and checks the server answers a
# device list on this machine.
#
#   scripts/smoke-test-mcpb.sh <bundle.mcpb>
#
# The device list goes through mobilecli, so it fails when the bundle has no
# binary for this machine. No device is needed, only a list without an error.
set -euo pipefail

BUNDLE=$1
UNPACKED=mcpb-build/unpacked
OUT=mcpb-build/smoke-test.out
MCPB=@anthropic-ai/mcpb@2.1.2
TIMEOUT_SECONDS=60

rm -rf "$UNPACKED" "$OUT"
mkdir -p mcpb-build
npx -y "$MCPB" unpack "$BUNDLE" "$UNPACKED"

send_requests() {
	printf '%s\n' \
		'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke-test","version":"0"}}}' \
		'{"jsonrpc":"2.0","method":"notifications/initialized"}' \
		'{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"mobile_list_available_devices","arguments":{}}}'
}

# the server closes the connection when its input ends, so input stays open
# until the device list answer (id 2) is written, or the timeout passes
wait_for_device_list_answer() {
	for _ in $(seq "$TIMEOUT_SECONDS"); do
		grep -q '"id":2' "$OUT" 2>/dev/null && return
		sleep 1
	done
}

{ send_requests; wait_for_device_list_answer; } | node "$UNPACKED/lib/index.js" > "$OUT"
cat "$OUT"

grep -q '"id":2' "$OUT" || { echo "smoke-test: no answer to the device list within ${TIMEOUT_SECONDS}s" >&2; exit 1; }
if grep -q '"isError":true' "$OUT"; then
	echo "smoke-test: the device list returned an error" >&2
	exit 1
fi
grep -q '\\"devices\\":\[' "$OUT" || { echo "smoke-test: the answer has no device list" >&2; exit 1; }
