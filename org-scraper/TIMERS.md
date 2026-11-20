# Timers

Ensure `tmux` is installed on Linux: `apt install tmux`.
Optionally install Cockpit: [https://cockpit-project.org/](https://cockpit-project.org/).

Add a timer / cron job to run:

- Name: `org-scraper`
- Description: Scrape new organizations
- Command: `tmux kill-session -t org-scraper 2>/dev/null; tmux new-session -d -s org-scraper -c "$HOME/asnm-agents/org-scraper" 'node'`
- 1 minute after system boot
