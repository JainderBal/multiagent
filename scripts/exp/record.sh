#!/bin/sh
# Measure one trial (scenario x condition) and append a row to the results CSV.
#
# Usage: record.sh <root> <scenario> <condition> <trial> <resultsCsv> <mod1> <mod2> ...
#   - Per-scenario base repo at <root>/<scenario>/base
#   - Per-module worktree at <root>/<scenario>/<condition>-<mod> on branch <condition>/<mod>
#   - <mod1> is the integration base (merged first); the rest are measured as PRs.
#   - Each agent writes src/<mod>.ts; shared types live in src/shared.ts.
#
# Outputs (CSV columns): scenario,condition,trial,n_modules,pr_count,text_conflicts,text_pct,tsc_errors,integrates
set -e
root=$1; scenario=$2; cond=$3; trial=$4; csv=$5; shift 5
mods="$@"
set -- $mods
first=$1; shift; rest="$@"
base="$root/$scenario/base"
TSC="node /c/Users/balja/source/repos/multiagent/node_modules/typescript/bin/tsc"

# 1. Commit each module worktree.
for m in $mods; do
  wt="$root/$scenario/$cond-$m"
  git -C "$wt" add -A >/dev/null 2>&1 || true
  git -C "$wt" commit -q -m "$cond: $m" >/dev/null 2>&1 || true
done

# 2. Establish integration base from the first module.
intb="$cond-int-$scenario-$trial"
git -C "$base" checkout -q -B "$intb" main
git -C "$base" merge -q --no-ff "$cond/$first" -m "int $first" >/dev/null 2>&1 || true

# 3. Text-conflict measurement (our tool) over the remaining PRs.
prbranches=""
for m in $rest; do prbranches="$prbranches $cond/$m"; done
pr_count=$(echo $rest | wc -w)
measured=$(cd "$base" && multiagent measure "$intb" $prbranches 2>/dev/null | tail -1)
# measured like: "N branches, M text-conflicts (P%)"
text_conflicts=$(echo "$measured" | sed -n 's/.*, \([0-9]*\) text-conflicts.*/\1/p')
text_pct=$(echo "$measured" | sed -n 's/.*(\([0-9]*\)%).*/\1/p')
[ -z "$text_conflicts" ] && text_conflicts=NA
[ -z "$text_pct" ] && text_pct=NA

# 4. Semantic integration: assemble every module's src/<mod>.ts onto the base's
#    shared.ts and typecheck. (Base already has <first>'s files + shared.ts.)
git -C "$base" checkout -q "$intb"
for m in $rest; do
  cp "$root/$scenario/$cond-$m/src/$m.ts" "$base/src/$m.ts" 2>/dev/null || true
done
tsc_out=$(cd "$base" && $TSC --noEmit -p . 2>&1 || true)
tsc_errors=$(echo "$tsc_out" | grep -c "error TS" || true)
if [ "$tsc_errors" -eq 0 ]; then integrates=yes; else integrates=no; fi
git -C "$base" checkout -q -- . 2>/dev/null || true
git -C "$base" clean -fdq src/ 2>/dev/null || true

n_modules=$(echo $mods | wc -w)
[ -f "$csv" ] || echo "scenario,condition,trial,n_modules,pr_count,text_conflicts,text_pct,tsc_errors,integrates" > "$csv"
echo "$scenario,$cond,$trial,$n_modules,$pr_count,$text_conflicts,$text_pct,$tsc_errors,$integrates" >> "$csv"
echo "RESULT $scenario/$cond t$trial: $text_conflicts/$pr_count conflicts (${text_pct}%), tsc_errors=$tsc_errors integrates=$integrates"
