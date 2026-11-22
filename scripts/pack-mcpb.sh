#!/usr/bin/env bash
# Packs a Claude Desktop bundle (.mcpb) for one platform from the built lib/.
#
#   scripts/pack-mcpb.sh <version> <darwin|win32> <output.mcpb>
#
# Run from the repository root after `npm run build`. Work files go in mcpb-build/.
# Paths stay relative because on Windows, tar reads "D:\..." as a remote host.
set -euo pipefail

VERSION=$1
PLATFORM=$2
OUTPUT=$3
BUILD=mcpb-build
STAGE=$BUILD/stage
MCPB=@anthropic-ai/mcpb@2.1.2

case "$PLATFORM" in
	darwin) MOBILECLI_TARGETS="darwin-arm64 darwin-amd64" ;;
	win32) MOBILECLI_TARGETS="windows-amd64 windows-arm64" ;;
	*) echo "unknown platform: $PLATFORM (expected darwin or win32)" >&2; exit 1 ;;
esac

fail() {
	echo "pack-mcpb: $*" >&2
	exit 1
}

lockfile_field() {
	node -p "(require('./package-lock.json').packages['$1'] || {})['$2'] || ''"
}

# npm installs only the optional packages that match the host. The bundle needs
# this platform's mobilecli binaries instead, so every optional package is skipped
# and those are added by hand. Anything else optional would be lost silently.
assert_only_mobilecli_is_optional() {
	local others
	others=$(node -p "Object.entries(require('./package-lock.json').packages).filter(([k, v]) => k && v.optional && !v.dev && !k.startsWith('node_modules/@mobilenext/mobilecli-')).map(([k]) => k).join(' ')")
	[ -z "$others" ] || fail "optional packages other than mobilecli would be left out: $others"
}

add_mobilecli_binary() {
	local target=$1
	local pkg="node_modules/@mobilenext/mobilecli-$target"
	local url integrity actual
	url=$(lockfile_field "$pkg" resolved)
	integrity=$(lockfile_field "$pkg" integrity)
	[ -n "$url" ] && [ -n "$integrity" ] || fail "$pkg is missing from package-lock.json"

	curl -fsSL "$url" -o "../$target.tgz" || fail "could not download $url"
	actual="sha512-$(openssl dgst -sha512 -binary "../$target.tgz" | openssl base64 -A)"
	[ "$actual" = "$integrity" ] || fail "$pkg integrity mismatch: lockfile $integrity, downloaded $actual"

	mkdir -p "$pkg"
	tar -xzf "../$target.tgz" --strip-components=1 -C "$pkg"
}

rm -rf "$STAGE"
mkdir -p "$STAGE"
cp -r lib package.json package-lock.json manifest.json icon.png "$STAGE/"
cd "$STAGE"

VERSION=$VERSION PLATFORM=$PLATFORM node -e "
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync('manifest.json'));
manifest.version = process.env.VERSION;
manifest.compatibility.platforms = [process.env.PLATFORM];
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, '\t'));
"
npm version "$VERSION" --no-git-tag-version --allow-same-version

assert_only_mobilecli_is_optional
npm ci --omit=dev --omit=optional --ignore-scripts
for target in $MOBILECLI_TARGETS; do
	add_mobilecli_binary "$target"
done

npx -y "$MCPB" pack . "../../$OUTPUT"
ls -lh "../../$OUTPUT"
