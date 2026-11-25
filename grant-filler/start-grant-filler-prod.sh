#!/bin/bash
source /home/faisal/.nvm/nvm.sh
cd /home/faisal/asnm-agents/grant-filler
npm run prod
status=$?
echo "npm run prod exited with status $status"
exec bash -i
