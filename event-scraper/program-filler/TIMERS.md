# Timers

Ensure `tmux` is installed on Linux: `apt install tmux`.
Optionally install Cockpit: [https://cockpit-project.org/](https://cockpit-project.org/).

Add a timer / cron job to run:

- Name: `program-filler`
- Description: Fill existing D1 program rows
- Command: `tmux kill-session -t program-filler 2>/dev/null; tmux new-session -d -s program-filler -c "$HOME/asnm-agents/program-filler" 'node'`
- 1 minute after system boot
