# Timers

Ensure `tmux` is installed on Linux: `apt install tmux`.
Optionally install Cockpit: [https://cockpit-project.org/](https://cockpit-project.org/).

Add a timer / cron job to run:

- Name: `event-filler`
- Description: Fill existing D1 event rows
- Command: `tmux kill-session -t event-filler 2>/dev/null; tmux new-session -d -s event-filler -c "$HOME/asnm-agents/event-filler" 'node'`
- 1 minute after system boot
