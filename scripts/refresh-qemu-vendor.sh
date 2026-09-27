#!/usr/bin/env bash
# Download the qemu-wasm wsmux release assets into vendor/.
#
# The qemu-wasm fork (justwasm/qemu-wasm) tags each wsmux-enabled build
# as vX.Y.Z-wsmuxN. The matching qemu-system-x86_64.{wasm,out.js,
# worker.js} are uploaded to the GitHub release; we fetch them here so
# the plugin can be loaded directly off the filesystem without depending
# on a CDN. Re-run after bumping the QEMU_WASM_TAG to refresh the
# vendored binaries.
#
# Usage:
#   scripts/refresh-qemu-vendor.sh [tag]
#
# Environment overrides:
#   QEMU_WASM_REPO  default: justwasm/qemu-wasm
#   QEMU_WASM_TAG   default: v0.4.44-wsmux16
#
# Requires: gh (GitHub CLI), curl, sha256sum.

set -euo pipefail

REPO="${QEMU_WASM_REPO:-justwasm/qemu-wasm}"
TAG="${QEMU_WASM_TAG:-${1:-v0.4.44-wsmux16}}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/../plugin/qemu-playground" && pwd)"
VENDOR_DIR="$PLUGIN_DIR/vendor"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

ASSETS=(qemu-system-x86_64.wasm qemu-system-x86_64.out.js qemu-system-x86_64.worker.js)

if ! command -v gh >/dev/null 2>&1; then
  echo "error: gh (GitHub CLI) is required" >&2
  exit 1
fi

echo "Fetching $REPO release $TAG into $VENDOR_DIR"
mkdir -p "$VENDOR_DIR"

for asset in "${ASSETS[@]}"; do
  gh release download "$TAG" --repo "$REPO" --pattern "$asset" --dir "$TMP"
  if [ ! -f "$TMP/$asset" ]; then
    echo "error: asset $asset missing from release $TAG" >&2
    exit 1
  fi
done

EXPECTED="$(gh release view "$TAG" --repo "$REPO" --json body --jq '.body' 2>/dev/null || true)"
if [[ "$EXPECTED" == *SHA256SUMS* ]]; then
  gh release download "$TAG" --repo "$REPO" --pattern 'SHA256SUMS' --dir "$TMP"
  ( cd "$TMP" && sha256sum -c --strict SHA256SUMS )
else
  echo "warning: release $TAG did not include SHA256SUMS; skipping verification" >&2
fi

for asset in "${ASSETS[@]}"; do
  mv -f "$TMP/$asset" "$VENDOR_DIR/${asset//qemu-system-x86_64.out.js/out.js}"
done

echo "Updated $VENDOR_DIR:"
ls -la "$VENDOR_DIR"