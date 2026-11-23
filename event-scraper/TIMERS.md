# Timers

Ensure `tmux` is installed on Linux: `apt install tmux`.
Optionally install Cockpit: [https://cockpit-project.org/](https://cockpit-project.org/).

Add a timer / cron job to run:

- Name: `event-scraper`
- Description: Scrape new events
- Command: `tmux kill-session -t event-scraper 2>/dev/null; tmux new-session -d -s event-scraper -c "$HOME/asnm-agents/event-scraper" 'node'`
- 1 minute after system boot
