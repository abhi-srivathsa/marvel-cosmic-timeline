import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const timelinePath = path.join(root, "src/data/timeline.ts");
const stillsDir = path.join(root, "public/stills");
const manifestPath = path.join(root, "src/data/stillImages.ts");
const sourcePath = path.join(root, "public/stills/sources.json");

const source = await readFile(timelinePath, "utf8");

const ids = Array.from(source.matchAll(/id: "([^"]+)"/g), (match) => match[1]);
const entries = Array.from(
  source.matchAll(/"([^"]+)": "([^"]+)",/g),
  (match) => [match[1], match[2]],
);
const eventImagePages = Object.fromEntries(entries);
const fileOverrides = {
  "eyes-of-wakanda": "File:Marvel Animation’s Eyes of Wakanda - Official Sneak Peek - Disney+",
  "captain-marvel": "File:Captain Marvel (film) 80.jpg",
  "iron-man": "File:Iron Man Escape DS.png",
  "agents-shield-s1": "File:AOS 508 Coulson May Daisy.jpg",
  "daredevil-s1": "File:DD-NinjaAmbush.jpg",
  "ant-man": "File:Ant-Man screenshot 27.jpg",
  "daredevil-s2": "File:DD-Strangles-FC-S2E03.jpg",
  "luke-cage-s1": "File:Cage-BlockingBullets-S1E6.jpg",
  "iron-fist-s1": "File:Bakuto-vs-IronFist-RoundOne.png",
  "punisher-s1": "File:Attack on Frank Castle.png",
  "luke-cage-s2": "File:Bushmaster-LCage-Fighting-TeamUp.png",
  "iron-fist-s2": "File:IFS2x10 Colleen Wing & Davos (Iron Fist Punch).png",
  "daredevil-s3": "File:Daredevil vs. Dex (Bulletin Office).jpg",
  "jessica-jones-s3": "File:GSallingerTalksToJJones-1-JJ304.jpg",
  "loki-s1": "File:Reorganizing the Multiverse.png",
  "falcon-winter-soldier": "File:Dovich and Karli Morgenthau.jpg",
  "moon-knight": "File:Arthur Harrow vs. Moon Knight.png",
  "she-hulk": "File:Daredevil & She-Hulk.png",
  "ms-marvel": "File:Bruno tells Kamala she's a mutant.jpg",
  "ironheart": "File:Ironheart defeats Namora.jpg",
  "quantumania": "File:Ant-Man & Kang the Conqueror.jpg",
  "the-marvels": "File:Monica Rambeau Seals the Rift.png",
  "what-if-s2": "File:Attack on the Sky World Village.png",
  "what-if-s3": "File:What If...? Season 3 - Protect Everyone - Disney+-2",
  "daredevil-born-again-s1": "File:Daredevil in Muse's Workshop.jpg",
  "brave-new-world": "File:Captain America Brave New World Teaser Trailer (87).png",
  "daredevil-born-again-s2": "File:Daredevil and Punisher yelling at each other.png",
  "punisher-one-last-kill": "File:Daredevil and Punisher yelling at each other.png",
  "thunderbolts": "File:Ava, Bob, Yelena & U.S. Agent.jpg",
  "wonder-man": "File:Simon Williams meets Trevor Slattery.png",
};

const wikipediaPages = Object.fromEntries(
  Array.from(
    source.matchAll(/id: "([^"]+)",[\s\S]*?wikiPage: "([^"]+)"/g),
    (match) => [match[1], match[2]],
  ),
);

const titleById = Object.fromEntries(
  Array.from(
    source.matchAll(/id: "([^"]+)",[\s\S]*?title: "([^"]+)"/g),
    (match) => [match[1], match[2]],
  ),
);

function endpoint(params) {
  const url = new URL("https://marvelcinematicuniverse.fandom.com/api.php");
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  return url.toString();
}

async function getFandomImage(pageTitle) {
  const response = await fetch(
    endpoint({
      action: "query",
      titles: pageTitle,
      prop: "pageimages",
      pithumbsize: "1400",
    }),
    { headers: { accept: "application/json" } },
  );

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const page = Object.values(data?.query?.pages ?? {})[0];

  if (page?.missing !== undefined || !page?.thumbnail?.source) {
    return null;
  }

  return {
    page: page.title,
    url: page.thumbnail.source,
    provider: "MCU Wiki",
  };
}

async function searchFandomImage(query) {
  const response = await fetch(
    endpoint({
      action: "query",
      list: "search",
      srlimit: "4",
      srsearch: query,
    }),
    { headers: { accept: "application/json" } },
  );

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const results = data?.query?.search ?? [];

  for (const result of results) {
    const image = await getFandomImage(result.title);
    if (image) {
      return image;
    }
  }

  return null;
}

async function getFileImage(fileTitle) {
  const response = await fetch(
    endpoint({
      action: "query",
      titles: fileTitle,
      prop: "imageinfo",
      iiprop: "url|mime|size",
      iiurlwidth: "1400",
    }),
    { headers: { accept: "application/json" } },
  );

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const page = Object.values(data?.query?.pages ?? {})[0];
  const info = page?.imageinfo?.[0];

  if (page?.missing !== undefined || (!info?.mime?.startsWith("image/") && info?.mime !== "video/youtube")) {
    return null;
  }

  return {
    page: page.title,
    url: info.thumburl || info.url,
    provider: "MCU Wiki file",
  };
}

async function getWikipediaImage(pageTitle) {
  const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const url = data?.thumbnail?.source || data?.originalimage?.source;
  return url ? { page: data.title ?? pageTitle, url, provider: "Wikipedia" } : null;
}

function extensionFromContentType(contentType) {
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("gif")) return "gif";
  return "img";
}

async function downloadImage(image, id) {
  const response = await fetch(image.url, {
    headers: {
      accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "user-agent": "Mozilla/5.0 (compatible; MarvelTimeline/1.0)",
    },
  });

  if (!response.ok) {
    throw new Error(`${id}: failed to download ${image.url} (${response.status})`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`${id}: response was ${contentType || "unknown content type"}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 2048) {
    throw new Error(`${id}: image too small (${bytes.byteLength} bytes)`);
  }

  const ext = extensionFromContentType(contentType);
  const filename = `${id}.${ext}`;
  await writeFile(path.join(stillsDir, filename), bytes);

  return {
    ...image,
    bytes: bytes.byteLength,
    file: `/stills/${filename}`,
  };
}

await rm(stillsDir, { recursive: true, force: true });
await mkdir(stillsDir, { recursive: true });

const manifest = {};
const sources = [];

for (const id of ids) {
  const eventPage = eventImagePages[id] ?? titleById[id];
  const title = titleById[id] ?? id;
  const wikiPage = wikipediaPages[id] ?? title;

  const image =
    (fileOverrides[id] ? await getFileImage(fileOverrides[id]) : null) ??
    (await getFandomImage(eventPage)) ??
    (await searchFandomImage(`${eventPage} ${title}`)) ??
    (await getWikipediaImage(wikiPage));

  if (!image) {
    throw new Error(`${id}: no image source found`);
  }

  const downloaded = await downloadImage(image, id);
  manifest[id] = downloaded.file;
  sources.push({ id, title, eventPage, ...downloaded });
  console.log(`${id} <- ${downloaded.provider}: ${downloaded.page}`);
}

const manifestSource = `export const stillImages = ${JSON.stringify(manifest, null, 2)} as const;\n`;
await writeFile(manifestPath, manifestSource);
await writeFile(sourcePath, JSON.stringify(sources, null, 2));

console.log(`Downloaded ${sources.length} stills.`);
