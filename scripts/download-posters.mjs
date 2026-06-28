import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const timelinePath = path.join(root, "src/data/timeline.ts");
const posterDir = path.join(root, "public/posters");
const manifestPath = path.join(root, "src/data/posterImages.ts");
const sourcePath = path.join(root, "public/posters/sources.json");

const posterPages = {
  "agents-shield-s1": "Agents of S.H.I.E.L.D./Season One",
  "daredevil-s1": "Daredevil (TV series)/Season One",
  "daredevil-s2": "Daredevil (TV series)/Season Two",
  "daredevil-s3": "Daredevil (TV series)/Season Three",
  "jessica-jones-s1": "Jessica Jones (TV series)/Season One",
  "jessica-jones-s2": "Jessica Jones (TV series)/Season Two",
  "jessica-jones-s3": "Jessica Jones (TV series)/Season Three",
  "luke-cage-s1": "Luke Cage (TV series)/Season One",
  "luke-cage-s2": "Luke Cage (TV series)/Season Two",
  "iron-fist-s1": "Iron Fist (TV series)/Season One",
  "iron-fist-s2": "Iron Fist (TV series)/Season Two",
  "punisher-s1": "The Punisher (TV series)/Season One",
  "punisher-s2": "The Punisher (TV series)/Season Two",
  "loki-s1": "Loki/Season One",
  "loki-s2": "Loki/Season Two",
  "what-if-s1": "What If...?/Season One",
  "what-if-s2": "What If...?/Season Two",
  "what-if-s3": "What If...?/Season Three",
  "daredevil-born-again-s1": "Daredevil: Born Again/Season One",
  "daredevil-born-again-s2": "Daredevil: Born Again/Season Two",
  "punisher-one-last-kill": "The Punisher",
};

const fileOverrides = {
  "ant-man": "File:Ant-Man (Iron Man) Poster.jpg",
  "black-panther": "File:Black Panther Poster October 2017.jpg",
  "incredible-hulk": "File:The Incredible Hulk Marvel Poster.jpg",
  "iron-man-2": "File:Iron Man 2 Alternate International Official Poster.jpg",
  "guardians-galaxy": "File:Guardians of the Galaxy Simple Poster.png",
  "eyes-of-wakanda": "File:Eyes of Wakanda Stained Glass Tall Poster.jpg",
  "agent-carter": "File:Agent Carter Season 1 - Promotional Poster.jpg",
  "eternals": "File:Eternals (film) poster 019.jpg",
  "daredevil-s2": "File:Daredevil Season 2 Poster.jpg",
  "iron-fist-s2": "File:Iron Fist D+ Poster.jpeg",
  "the-defenders": "File:DEFENDERS Vertical-AWK RGB PRE US.jpg",
  "punisher-s1": "File:The Punisher S1 poster variant.jpg",
  "loki-s1": "File:Loki S1 Poster 1.jpg",
  "loki-s2": "File:Loki S02 Poster.jpg",
  "marvel-zombies": "File:Marvel Zombies Poster Tall.jpg",
  "wandavision": "File:WandaVision Poster 3.jpg",
  "falcon-winter-soldier": "File:TF&TWS Final Poster.jpg",
  "hawkeye": "File:Hawkeye Final Poster.jpg",
  "moon-knight": "File:Moon Knight Final Poster.jpg",
  "echo": "File:Echo Tall Poster.jpg",
  "she-hulk": "File:She-Hulk Attorney at Law Season One Poster.jpg",
  "guardians-holiday-special": "File:Guardians Holiday Special Poster.jpg",
  "secret-invasion": "File:Secret Invasion - Poster.jpg",
  "agatha-all-along": "File:Agatha All Along - Tall Poster.jpg",
  "wonder-man": "File:Wonder Man January Poster.jpg",
  "daredevil-born-again-s2": "File:Daredevil Born Again S2 Teaser Poster.jpg",
  "punisher-s2": "File:The Punisher Second S2 Poster.jpg",
  "punisher-one-last-kill": "File:The Punisher Second S2 Poster.jpg",
};

const titleAliases = {
  "agents-shield-s1": "Agents of S.H.I.E.L.D.",
  "daredevil-s1": "Daredevil",
  "daredevil-s2": "Daredevil",
  "daredevil-s3": "Daredevil",
  "jessica-jones-s1": "Jessica Jones",
  "jessica-jones-s2": "Jessica Jones",
  "jessica-jones-s3": "Jessica Jones",
  "luke-cage-s1": "Luke Cage",
  "luke-cage-s2": "Luke Cage",
  "iron-fist-s1": "Iron Fist",
  "iron-fist-s2": "Iron Fist",
  "punisher-s1": "The Punisher",
  "punisher-s2": "The Punisher",
  "ant-man-wasp": "Ant-Man and the Wasp",
  "guardians-vol-3": "Guardians of the Galaxy Vol. 3",
  "daredevil-born-again-s1": "Daredevil: Born Again",
  "daredevil-born-again-s2": "Daredevil: Born Again",
  "punisher-one-last-kill": "The Punisher",
};

const source = await readFile(timelinePath, "utf8");
const entryBlocks = source.match(/\{\n    id: "[\s\S]*?\n  \}/g) ?? [];
const entries = entryBlocks.map((block) => ({
  id: block.match(/id: "([^"]+)"/)?.[1],
  title: block.match(/title: "([^"]+)"/)?.[1],
  wikiPage: block.match(/wikiPage: "([^"]+)"/)?.[1],
})).filter((entry) => entry.id && entry.title);

function endpoint(params) {
  const url = new URL("https://marvelcinematicuniverse.fandom.com/api.php");
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  return url.toString();
}

async function getFandomPoster(pageTitle) {
  const response = await fetch(
    endpoint({
      action: "query",
      titles: pageTitle,
      prop: "pageimages",
      pithumbsize: "2160",
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
    width: page.thumbnail.width,
    height: page.thumbnail.height,
  };
}

async function searchFandomPoster(query) {
  const response = await fetch(
    endpoint({
      action: "query",
      list: "search",
      srlimit: "5",
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
    const image = await getFandomPoster(result.title);
    if (image) {
      return image;
    }
  }

  return null;
}

async function getFilePoster(fileTitle) {
  const response = await fetch(
    endpoint({
      action: "query",
      titles: fileTitle,
      prop: "imageinfo",
      iiprop: "url|mime|size",
      iiurlwidth: "2160",
    }),
    { headers: { accept: "application/json" } },
  );

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const page = Object.values(data?.query?.pages ?? {})[0];
  const info = page?.imageinfo?.[0];

  if (page?.missing !== undefined || !info?.mime?.startsWith("image/")) {
    return null;
  }

  return {
    page: page.title,
    url: info.thumburl || info.url,
    provider: "MCU Wiki file",
    width: info.thumbwidth || info.width,
    height: info.thumbheight || info.height,
  };
}

async function getWikipediaPoster(pageTitle) {
  const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const url = data?.originalimage?.source || data?.thumbnail?.source;
  return url ? { page: data.title ?? pageTitle, url, provider: "Wikipedia" } : null;
}

function extensionFromContentType(contentType) {
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
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
  if (bytes.byteLength < 4096) {
    throw new Error(`${id}: image too small (${bytes.byteLength} bytes)`);
  }

  const ext = extensionFromContentType(contentType);
  const filename = `${id}.${ext}`;
  await writeFile(path.join(posterDir, filename), bytes);

  return {
    ...image,
    bytes: bytes.byteLength,
    file: `/posters/${filename}`,
  };
}

await rm(posterDir, { recursive: true, force: true });
await mkdir(posterDir, { recursive: true });

const manifest = {};
const sources = [];

for (const entry of entries) {
  const id = entry.id;
  const preferredTitle = posterPages[id] ?? titleAliases[id] ?? entry.title;
  const searchTitle = titleAliases[id] ?? entry.title.replace(/ S\d+$/, "");

  const image =
    (fileOverrides[id] ? await getFilePoster(fileOverrides[id]) : null) ??
    (await getFandomPoster(preferredTitle)) ??
    (await getFandomPoster(searchTitle)) ??
    (await searchFandomPoster(`${searchTitle} official poster`)) ??
    (await getWikipediaPoster(entry.wikiPage));

  if (!image) {
    throw new Error(`${id}: no poster source found`);
  }

  const downloaded = await downloadImage(image, id);
  manifest[id] = downloaded.file;
  sources.push({ id, title: entry.title, preferredTitle, ...downloaded });
  console.log(`${id} <- ${downloaded.provider}: ${downloaded.page}`);
}

const manifestSource = `export const posterImages = ${JSON.stringify(manifest, null, 2)} as const;\n`;
await writeFile(manifestPath, manifestSource);
await writeFile(sourcePath, JSON.stringify(sources, null, 2));

console.log(`Downloaded ${sources.length} posters.`);
