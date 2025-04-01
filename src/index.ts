export interface Env {
  GOCOMICS_SLUG: string;
  WEBHOOK_ID: string;
  WEBHOOK_TOKEN: string;
}

interface ComicPagePayload {
  "@context": "https://schema.org";
  "@type": "ImageObject" | "ComicSeries";
  // comicseries
  isAccessibleForFree?: boolean;
  genre?: string;
  inLanguage?: string;
  publisher?: {
    "@type": string;
    name: string;
    url: string;
    logo: { "@type": string; url: string };
    sameAs: string[];
  };

  name: string;
  description: string;
  url: string;
  author: { "@type": string; name: string };
  contentUrl: string;
  creator: {
    "@type": string;
    name: string;
    url: string;
  };
  datePublished: string;
  representativeOfPage: boolean;
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
    const selector = `div[data-sentry-component="ComicViewer"] script[type="application/ld+json"][data-sentry-component="Schema"]`;
    url.searchParams.set("selector", selector);
    url.searchParams.set("scrape", "text");
    const response = await fetch(url);
    if (!response.ok) {
      throw Error(`Bad response from scraper: ${response.status}`);
    }

    const data = (await response.json()) as {
      result: Record<string, string[]>;
    };
    console.log("Result:", data.result);
    if (!data.result || !data.result[selector]?.length) {
      throw Error(
        `No suitable data found on ${env.GOCOMICS_SLUG} page (${formatted})`,
      );
    }

    let strip: ComicPagePayload | undefined;
    let image: Blob | undefined;
    for (const raw of data.result[selector]) {
      let parsed: ComicPagePayload;
      try {
        parsed = JSON.parse(raw) as ComicPagePayload;
      } catch {
        console.log("Failed to parse as JSON:", raw);
        continue;
      }
      console.log("Parsed:", parsed);
      if (parsed.representativeOfPage && parsed.contentUrl) {
        console.log("Found good payload with content URL:", parsed.contentUrl);
        const response = await fetch(parsed.contentUrl, { method: "GET" });
        // console.log({ response });
        if (
          response.ok &&
          response.headers.get("Content-Type")?.startsWith("image/")
        ) {
          strip = parsed;
          image = await response.blob();
          break;
        }
      }
    }
    if (!strip || !image) {
      throw Error(
        `No suitable data found on ${env.GOCOMICS_SLUG} page (${formatted}) after ${data.result[selector].length} data scripts`,
      );
    }

    console.log("Creating formdata");
    const form = new FormData();
    form.set(
      "payload_json",
      JSON.stringify({
        content: `[${strip.name}](<https://www.gocomics.com/${env.GOCOMICS_SLUG}/${formatted}>)`,
        attachments: [{ id: 0 }],
        allowed_mentions: { parse: [] },
      }),
    );
    // They are actually type image/gif, but you can pretend they're PNGs and
    // remove the GIF badge in the corner.
    form.set("files[0]", image, `${formatted.replace(/\//g, "-")}.png`);
    console.log(form);

    const discordResponse = await fetch(
      `https://discord.com/api/v10/webhooks/${env.WEBHOOK_ID}/${env.WEBHOOK_TOKEN}`,
      {
        method: "POST",
        body: form,
      },
    );
    console.log({ discordResponse });
  },
};
