#!/bin/bash
source /home/faisal/.nvm/nvm.sh
cd /home/faisal/asnm-agents/event-filler
npm run staging
status=$?
echo "npm run staging exited with status $status"
exec bash -i
