export interface Env {
  GOCOMICS_SLUG: string;
  WEBHOOK_ID: string;
  WEBHOOK_TOKEN: string;
}

export default {
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    console.log(`Checking for today's ${env.GOCOMICS_SLUG} comic...`);
    // We were originally checking the index for today's comic (whatever is
    // the latest comic regardless of client timezone) but it turns out that
    // it doesn't stop implying "Today's comic" when the comic isn't from today.
    // So instead we're doing it the more predictable way.

    const now = new Date(event.scheduledTime);
    const formatted = [
      now.getUTCFullYear(),
      now.getUTCMonth() + 1,
      now.getUTCDate(),
    ]
      .map(String)
      .join("/");

    // This is not a very performance-critical application so I opted to use
    // this public scraper rather than re-invent the wheel.
    // https://github.com/adamschwartz/web.scraper.workers.dev
    const url = new URL("https://web.scraper.workers.dev");
    url.searchParams.set(
      "url",
      `https://www.gocomics.com/${env.GOCOMICS_SLUG}/${formatted}`,
    );
    url.searchParams.set("selector", "picture.item-comic-image>img");
    url.searchParams.set("scrape", "attr");
    url.searchParams.set("attr", "src");
    const response = await fetch(url);
    if (!response.ok) {
      throw Error(`Bad response from scraper: ${response.status}`);
    }

    const data = (await response.json()) as { result: string };
    if (!data.result) {
      throw Error(`No image found on ${env.GOCOMICS_SLUG} page (${formatted})`);
    }

    await fetch(
      `https://discord.com/api/v10/webhooks/${env.WEBHOOK_ID}/${env.WEBHOOK_TOKEN}`,
      {
        method: "POST",
        body: JSON.stringify({
          embeds: [
            {
              title: `<t:${Math.floor(event.scheduledTime / 1000)}:D>`,
              url: url.searchParams.get("url"),
              image: { url: data.result },
              color: 0xfefefe,
              // footer: { text: env.GOCOMICS_SLUG },
            },
          ],
        }),
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  },
};
