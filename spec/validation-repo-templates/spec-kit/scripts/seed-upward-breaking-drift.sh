#!/usr/bin/env bash
set -euo pipefail

target="src/auth/jwt.ts"

if ! test -f "$target"; then
  echo "Missing $target" >&2
  exit 1
fi

# Remove the 'token' field from JwtPayload — breaking upward drift
bun -e "
const file = 'src/auth/jwt.ts';
const source = await Bun.file(file).text();
const updated = source.replace('  token: string;\n', '');
if (source === updated) {
  throw new Error('Expected token field not found in src/auth/jwt.ts');
}
await Bun.write(file, updated);
"

echo "Seeded upward breaking drift by removing token field from JwtPayload."
