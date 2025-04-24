export interface Env {
  GOCOMICS_SLUG: string;
  WEBHOOK_ID: string;
  WEBHOOK_TOKEN: string;
  API?: Fetcher;
}

const stdTimezoneOffset = (date: Date) => {
  const jan = new Date(date.getFullYear(), 0, 1);
  const jul = new Date(date.getFullYear(), 6, 1);
  return Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
};

const convertTZ = (date: Date, tzString: string) =>
  new Date(date.toLocaleString("en-US", { timeZone: tzString }));

const isDstObserved = (date: Date) => {
  const today = convertTZ(date, "America/New_York");
  return today.getTimezoneOffset() < stdTimezoneOffset(today);
};

export default {
  // favicon.ico requests
  // async fetch() {
  //   return new Response(null, { status: 204 });
  // },
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    const now = new Date(event.scheduledTime);
    const { cron } = event;
    // 15:00 for standard time, 14:00 for daylight time (according to EST/EDT)
    if (cron === "0 15 * * *" && isDstObserved(now)) {
      return;
    } else if (cron === "0 14 * * *" && !isDstObserved(now)) {
      return;
    }

    console.log(`Checking for today's ${env.GOCOMICS_SLUG} comic...`);
    // We were originally checking the index for today's comic (whatever is
    // the latest comic regardless of client timezone) but it turns out that
    // it doesn't stop implying "Today's comic" when the comic isn't from today.
    // So instead we're doing it the more predictable way.

    const formatted = [
      now.getUTCFullYear().toString(),
      (now.getUTCMonth() + 1).toString().padStart(2, "0"),
      now.getUTCDate().toString().padStart(2, "0"),
    ].join("-");

    const route = `/api/v1/comics/${env.GOCOMICS_SLUG}/strips/${formatted}`;
    let response: Response;
    if (env.API) {
      response = await env.API.fetch(`http://localhost${route}`);
    } else {
      response = await fetch(`https://fxgocomics.com${route}`);
    }
    if (!response.ok) {
      throw Error(
        `Bad response from API: ${response.status} - ${await response.text()}`,
      );
    }

    const data = (await response.json()) as {
      title: string;
      canonicalUrl: string;
      imageUrl: string;
      published: string;
    };
    const discordResponse = await fetch(
      `https://discord.com/api/v10/webhooks/${env.WEBHOOK_ID}/${env.WEBHOOK_TOKEN}?with_components=true`,
      {
        method: "POST",
        body: JSON.stringify({
          flags: 1 << 15,
          components: [
            {
              type: 10,
              content: `[${data.title}](<${data.canonicalUrl}>)`,
            },
            {
              type: 12,
              items: [{ media: { url: data.imageUrl } }],
            },
          ],
        }),
        headers: { "Content-Type": "application/json" },
      },
    );
    console.log({ discordResponse });
  },
};
