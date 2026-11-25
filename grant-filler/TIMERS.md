# Timers

Ensure `tmux` is installed on Linux: `apt install tmux`.
Optionally install Cockpit: [https://cockpit-project.org/](https://cockpit-project.org/).

Add a timer / cron job to run:

- Name: `grant-filler`
- Description: Fill empty details on existing D1 grant rows
- Command: `tmux kill-session -t grant-filler 2>/dev/null; tmux new-session -d -s grant-filler -c "$HOME/asnm-agents/grant-filler" 'node'`
- 1 minute after system boot
