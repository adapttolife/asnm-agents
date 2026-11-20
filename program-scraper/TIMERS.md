# Timers

Ensure `tmux` is installed on Linux: `apt install tmux`.
Optionally install Cockpit: [https://cockpit-project.org/](https://cockpit-project.org/).

Add a timer / cron job to run:

- Name: `program-scraper`
- Description: Scrape new programs
- Command: `tmux kill-session -t program-scraper 2>/dev/null; tmux new-session -d -s program-scraper -c "$HOME/asnm-agents/program-scraper" 'node'`
- 1 minute after system boot
