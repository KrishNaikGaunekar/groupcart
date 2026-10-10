#!/usr/bin/env bash
# The whole dinner split, driven from the terminal with the real model and no iMessage.
# Each line is one person texting their own agent. Nothing is sent to a phone: every
# text an agent would send lands in the outbox, printed at the end.
#
#   scripts/demo_cli.sh            # uses a throwaway ledger
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export GROUPCART_SPLIT_DB="${GROUPCART_SPLIT_DB:-$(mktemp -d)/ledger.db}"
export GROUPCART_SPLIT_DRY_RUN=1
BOB=+19195550001 JOHN=+19195550002 SUSAN=+19195550003 CHARLIE=+19195550004

say() {  # say <phone> <label> <message> [image]
    local phone="$1" label="$2" text="$3" image="${4:-}"
    printf '\n\033[1m%s:\033[0m %s%s\n' "$label" "$text" "${image:+  [photo]}"
    GROUPCART_SESSION_USER_ID="$phone" "$ROOT/gc" chat -Q -t split ${image:+--image "$image"} -q "$text" 2>/dev/null \
        | grep -v '^session_id:' | sed "s/^/  ${label}'s agent: /"
}

say "$BOB" Bob "hey, i'm Bob. my venmo is bob-pays"
say "$JOHN" John "hi! this is John"
say "$SUSAN" Susan "hey i'm Susan"
say "$CHARLIE" Charlie "yo, Charlie here"
say "$BOB" Bob "just had dinner with John, Susan and Charlie. i had the california roll and the dr pepper" \
    "$ROOT/docs/assets/sample-receipt.png"
say "$JOHN" John "i had the spicy ramen, one of the sapporos, and split the edamame with susan"
say "$SUSAN" Susan "salmon nigiri and i shared the edamame with john"
say "$CHARLIE" Charlie "chicken katsu and a sapporo"
say "$JOHN" John "pay"
say "$SUSAN" Susan "i just venmo'd him"
say "$CHARLIE" Charlie "pay it"
say "$BOB" Bob "who still owes me? and what's my balance"

printf '\n\033[1m=== The agents'"'"' room ===\033[0m\n'
"$ROOT/gc" split room 2>/dev/null
printf '\n\033[1m=== Texts the agents sent to people ===\033[0m\n'
"$ROOT/gc" split outbox 2>/dev/null
