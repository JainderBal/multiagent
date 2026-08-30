#!/bin/sh
# Set up a scenario: base repo + control/treatment worktrees, optional frozen interface.
# Usage: setup.sh <root> <scenario> <specFile> <interfaceFile|NONE> <mod1> <mod2> ...
set -e
root=$1; scenario=$2; spec=$3; interface=$4; shift 4
mods="$@"
dir="$root/$scenario"
rm -rf "$dir"; mkdir -p "$dir/base/src"
base="$dir/base"
cat > "$base/tsconfig.json" <<'EOF'
{ "compilerOptions": { "target": "ES2022", "module": "NodeNext", "moduleResolution": "NodeNext", "strict": true, "noEmit": true, "skipLibCheck": true }, "include": ["src/**/*.ts"] }
EOF
cp "$spec" "$base/SPEC.md"
echo "export {};" > "$base/src/placeholder.ts"
git -C "$base" init -q -b main
git -C "$base" config user.email exp@test.local
git -C "$base" config user.name experiment
git -C "$base" add -A
git -C "$base" commit -q -m "base: $scenario spec + tsconfig"
for cond in control treatment; do
  for m in $mods; do
    git -C "$base" worktree add -q "$dir/$cond-$m" -b "$cond/$m" >/dev/null
  done
done
if [ "$interface" != "NONE" ]; then
  for m in $mods; do
    cp "$interface" "$dir/treatment-$m/src/shared.ts"
    git -C "$dir/treatment-$m" add src/shared.ts
    git -C "$dir/treatment-$m" commit -q -m "frozen interface"
  done
fi
echo "SETUP $scenario ready: $(echo $mods | wc -w) modules x 2 conditions"
