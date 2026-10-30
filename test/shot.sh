#!/bin/sh
# usage: test/shot.sh name [js] [waitMs]
cd "$(dirname "$0")/.."
mkdir -p test/shots
FERMATTA_SHOT="$PWD/test/shots/$1.png" FERMATTA_EVAL="$2" FERMATTA_WAIT="${3:-6000}" timeout ${TMO:-120} ./node_modules/electron/dist/electron.exe . 2>&1 | grep -E "missing|Error|error" | grep -v "GPU process\|gpu_process\|network_service" | head -20
cat "test/shots/$1.png.log" 2>/dev/null
