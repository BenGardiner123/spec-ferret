#!/usr/bin/env bash
set -euo pipefail

target="contracts/auth/jwt.contract.md"

if ! test -f "$target"; then
  echo "Missing $target" >&2
  exit 1
fi

bun -e "const file = 'contracts/auth/jwt.contract.md'; const source = await Bun.file(file).text(); const updated = source.replace('required: [id, email, token]', 'required: [id, email, token, expiresAt]'); if (source === updated) { throw new Error('Expected required list not found in contracts/auth/jwt.contract.md'); } await Bun.write(file, updated);"

echo "Resolved drift by restoring expiresAt as required."
