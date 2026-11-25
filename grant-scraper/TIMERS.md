# Timers

Ensure `tmux` is installed on Linux: `apt install tmux`.
Optionally install Cockpit: [https://cockpit-project.org/](https://cockpit-project.org/).

Add a timer / cron job to run:

- Name: `grant-scraper`
- Description: Discover new adaptive-sports grants
- Command: `tmux kill-session -t grant-scraper 2>/dev/null; tmux new-session -d -s grant-scraper -c "$HOME/asnm-agents/grant-scraper" 'node index.js --apply'`
- 1 minute after system boot
