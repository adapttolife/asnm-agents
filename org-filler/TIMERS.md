# Timers

Ensure `tmux` is installed on Linux: `apt install tmux`.
Optionally install Cockpit: [https://cockpit-project.org/](https://cockpit-project.org/).

Add a timer / cron job to run:

- Name: `org-filler`
- Description: Fill existing D1 organization rows
- Command: `tmux kill-session -t org-filler 2>/dev/null; tmux new-session -d -s org-filler -c "$HOME/asnm-agents/org-filler" 'node'`
- 1 minute after system boot
