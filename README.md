# Hlíðapósturinn

A small, calm website for the Hlíðar neighborhood in Reykjavík: upcoming events and openings, a static service directory, and an archive of past events. Written in Icelandic.

The site is plain HTML generated from two spreadsheet-style files. There is no framework and nothing to install: you need Node.js 18 or newer only to build it.

## Adding events

Events live in `data/events.csv`. You can open it in Excel, add a row, and save it as CSV (UTF-8 if Excel asks; Icelandic Excel's semicolon format also works).

| column | what to put |
| --- | --- |
| `dagsetning` | the date, as `2026-10-23` or `23.10.2026` |
| `klukkan` | the time, for example `20:00` or `10:00–14:00` (optional) |
| `titill` | the headline |
| `stadur` | where |
| `flokkur` | a short tag such as `Opnun`, `Íþróttir`, `Kirkja`, `Fundur`, `Námskeið`. `Opnun` is shown in yellow, everything else in a neutral tone |
| `lysing` | one line of detail (optional) |
| `hlekkur` | a web address; adds a "Nánar →" button (optional) |
| `lykur` | for a course, the last date; it stays on the homepage until then (optional) |

Lines starting with `#` are ignored. Upcoming events appear on the homepage grouped as "Þessi vika", "Næsta vika" and "Síðar". Events whose date has passed move to "Liðnir viðburðir" by themselves. Weekends and Icelandic public holidays get the clay-colored date tile automatically.

**The sample rows are placeholders.** Replace them with real events and real places before showing the site to anyone.

## Service directory

`data/thjonusta.csv`, with the columns `flokkur, nafn, heimilisfang, tegund, simi, vefur, lysing`. Each distinct `flokkur` becomes a card on the Þjónusta page.

## Settings

`site.json`:

- `tipEmail`: the address for tips (now a placeholder).
- `signupAction`: the form address from the email tool (Buttondown, MailerLite, Brevo and so on). While it is empty the signup box only says that signup opens soon.
- `noindex`: `true` keeps the site out of search engines. Set it to `false` when you launch.

## Build and preview

```
node build.mjs          # writes the site to public/
cd public && python3 -m http.server 8000
```

For testing a different "today": `TODAY=2026-12-01 node build.mjs`.

## Publishing

Any static host works. Connect this repository and use:

- Build command: `node build.mjs`
- Output directory: `public`

Because "this week" and "past" depend on the day the site was built, the site should be rebuilt every day (most hosts can trigger a build on a schedule or from a webhook).

## Design

Colors, type and spacing come from the Hlíðapósturinn design system. The typeface is Outfit, self-hosted in `src/fonts` (SIL Open Font License; see `src/fonts/OFL-Outfit.txt`). The palette is taken from the colors the architect Sigvaldi Thordarson used; the NCS-to-hex conversions are approximate.
