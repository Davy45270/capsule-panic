#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export LC_ALL=C
export MAGICK_THREAD_LIMIT=2
export RAYON_NUM_THREADS=2
planches=${PLANCHES_DIR:?Indiquer le dossier privé des planches avec PLANCHES_DIR}
outils=${ASSETS_TOOLS_DIR:-$HOME/Projets/homelab-diag/arcade-lab}
aseprite=/home/david/Projets/outils/aseprite/build/bin/aseprite
(
  cd "$planches"
  sha256sum --check <<'SHA'
860766652804071789fd7822f939a40e940d911851a7fb44eb0211555b83a254  Capsule_Panic_Assets_Planche_01.png
a50747b0c9b0c8ec89f79898f699e08b5f4af58d3cc61180c1225ac9d534f544  Capsule_Panic_Assets_Gameplay_02.png
ec2dc7cb11cc5d98f84725663d8f7827b2db1932854e063053b34969bcd1483a  Capsule_Panic_Assets_Gameplay_03.png
SHA
)
python3 scripts/assets-build.py "$(realpath "$planches")" "$outils" "$aseprite"
