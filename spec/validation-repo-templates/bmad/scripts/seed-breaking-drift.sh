#!/usr/bin/env bash
set -euo pipefail

target="contracts/auth/jwt.contract.md"

if ! test -f "$target"; then
  echo "Missing $target" >&2
  exit 1
fi

bun -e "const file = 'contracts/auth/jwt.contract.md'; const source = await Bun.file(file).text(); const updated = source.replace('required: [id, email, token, expiresAt]', 'required: [id, email, token]'); if (source === updated) { throw new Error('Expected required list not found in contracts/auth/jwt.contract.md'); } await Bun.write(file, updated);"

echo "Seeded breaking drift by removing expiresAt from required fields."
