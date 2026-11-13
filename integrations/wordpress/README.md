# Fernway for WordPress, and the Alder & Pike demo

- `plugin/fernway`: the plugin. A form block and an Elementor widget that send leads to Fernway (and so to
  GoHighLevel), with Settings, a connection test and a log of the last 50 sends (30 days).
- `theme/alder-pike`: a block theme made from scratch for an invented Tacoma roofer.
- `site/setup.php`: makes the demo's pages from the theme's patterns (`wp eval-file`, safe to run again).
- `box/`: the demo as it runs at https://alderpike.jeromebadour.com.

CI runs WordPress and MariaDB in containers, books a roof check through the plugin into a stand-in GoHighLevel, renders
the Elementor widget, and backs the site up and restores it.

## On the box (as root)

1. `box/setup.sh`: MariaDB and WordPress on `127.0.0.1:3105`, WordPress installed from the command line (the
   administrator's password from a hidden prompt), the pages, Nginx and the certificate. Safe to run again; a run
   also updates the images.
2. Make the routes on the Fernway account: `roof-check` (with the GHL calendar for roof checks) and `callback`.
3. `box/connect.sh <account>`: the site's own Fernway API key, written straight into WordPress and never shown, then
   the plugin's connection test.

Secrets live in `/srv/alderpike/.env` (root only). The nightly backup (`ops/backup-alderpike.sh`, run by Fernway's
backup) keeps the database and uploads 14 days on the box and copies them off it, encrypted.
