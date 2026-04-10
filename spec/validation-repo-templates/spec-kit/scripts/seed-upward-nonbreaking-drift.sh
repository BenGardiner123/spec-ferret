#!/usr/bin/env bash
set -euo pipefail

target="src/auth/jwt.ts"

if ! test -f "$target"; then
  echo "Missing $target" >&2
  exit 1
fi

# Add an optional 'refreshToken' field to JwtPayload — non-breaking upward drift
bun -e "
const file = 'src/auth/jwt.ts';
const source = await Bun.file(file).text();
const updated = source.replace('  expiresAt: string;\n}', '  expiresAt: string;\n  refreshToken?: string;\n}');
if (source === updated) {
  throw new Error('Expected expiresAt field not found in src/auth/jwt.ts');
}
await Bun.write(file, updated);
"

echo "Seeded upward non-breaking drift by adding optional refreshToken field to JwtPayload."
