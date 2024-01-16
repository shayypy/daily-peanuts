# daily-peanuts

Simple cron worker that checks a gocomics.com page once daily at 2 PM UTC (6 AM PST, 9 AM EST) for a new comic, then sends the comic image (if any) to a Discord webhook. I made this for Peanuts, hence the name, but you can substitute any valid comic from GoComics (e.g. `garfield`, `peanuts-begins`).

![image](https://frinkiac.com/meme/S05E08/142708.jpg?b64lines=WyBUaGlua2luZyBdIDEwMCwwMDAgUkVRVUVTVFMKIENBTiBQT1NUIE1BTlkgUEVBTlVUUy4=)

## Environment

- `GOCOMICS_SLUG` - the URL slug of the comic to check (the part after `gocomics.com` and before the date - like `peanuts`)
- `WEBHOOK_ID` - discord webhook ID (the long number in the webhook URL)
- `WEBHOOK_TOKEN` - discord webhook token (the last long string in the webhook URL)
