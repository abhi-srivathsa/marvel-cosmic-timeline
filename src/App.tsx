import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Search, X } from "lucide-react";
import { eventImagePages, timelineEntries, type TimelineEntry } from "./data/timeline";

type WikiImageState = {
  src: string | null;
  loading: boolean;
};

const imageCache = new Map<string, string | null>();

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function entryMatches(entry: TimelineEntry, query: string) {
  const normalizedQuery = normalize(query);

  if (!normalizedQuery) {
    return true;
  }

  const haystack = normalize(
    [entry.title, entry.medium, entry.yearLabel, entry.chapter, entry.event, entry.impact, ...entry.tags].join(" "),
  );

  return normalizedQuery.split(" ").every((part) => haystack.includes(part));
}

function SpaceCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    let animationFrame = 0;
    let width = 0;
    let height = 0;
    const stars = Array.from({ length: 180 }, (_, index) => ({
      x: Math.random(),
      y: Math.random(),
      speed: 0.04 + Math.random() * 0.16,
      radius: index % 13 === 0 ? 1.8 : 0.4 + Math.random() * 1.1,
      alpha: 0.22 + Math.random() * 0.75,
    }));

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#02030a";
      ctx.fillRect(0, 0, width, height);

      const drift = window.scrollY * 0.00012;

      for (const star of stars) {
        const x = ((star.x + drift * star.speed) % 1) * width;
        const y = ((star.y + drift * star.speed * 0.3) % 1) * height;
        ctx.beginPath();
        ctx.fillStyle = `rgba(255,255,255,${star.alpha})`;
        ctx.arc(x, y, star.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.save();
      ctx.globalAlpha = 0.17;
      ctx.strokeStyle = "#a8c7ff";
      ctx.lineWidth = 0.45;
      for (let i = 0; i < stars.length - 1; i += 17) {
        const a = stars[i];
        const b = stars[i + 7];
        if (!b) {
          continue;
        }
        ctx.beginPath();
        ctx.moveTo(a.x * width, a.y * height);
        ctx.lineTo(b.x * width, b.y * height);
        ctx.stroke();
      }
      ctx.restore();

      animationFrame = window.requestAnimationFrame(draw);
    };

    resize();
    draw();
    window.addEventListener("resize", resize);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas className="space-canvas" ref={canvasRef} aria-hidden="true" />;
}

async function fetchFandomImage(pageTitle: string): Promise<string | null> {
  const endpoint = new URL("https://marvelcinematicuniverse.fandom.com/api.php");
  endpoint.searchParams.set("action", "query");
  endpoint.searchParams.set("titles", pageTitle);
  endpoint.searchParams.set("prop", "pageimages");
  endpoint.searchParams.set("pithumbsize", "1200");
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("origin", "*");

  const response = await fetch(endpoint.toString(), { headers: { accept: "application/json" } });
  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const page = Object.values(data?.query?.pages ?? {})[0] as { thumbnail?: { source?: string } } | undefined;
  return page?.thumbnail?.source ?? null;
}

async function fetchWikipediaImage(pageTitle: string): Promise<string | null> {
  const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return data?.thumbnail?.source || data?.originalimage?.source || null;
}

function useTimelineImage(entry: TimelineEntry): WikiImageState {
  const cacheKey = `${eventImagePages[entry.id] ?? entry.title}::${entry.wikiPage}`;

  const [state, setState] = useState<WikiImageState>(() => {
    if (imageCache.has(cacheKey)) {
      return { src: imageCache.get(cacheKey) ?? null, loading: false };
    }

    return { src: null, loading: true };
  });

  useEffect(() => {
    let active = true;

    if (imageCache.has(cacheKey)) {
      setState({ src: imageCache.get(cacheKey) ?? null, loading: false });
      return () => {
        active = false;
      };
    }

    setState({ src: null, loading: true });

    const fandomPage = eventImagePages[entry.id] ?? entry.title;

    fetchFandomImage(fandomPage)
      .then((source) => source ?? fetchWikipediaImage(entry.wikiPage))
      .then((source) => {
        imageCache.set(cacheKey, source);
        if (active) {
          setState({ src: source, loading: false });
        }
      })
      .catch(() => {
        imageCache.set(cacheKey, null);
        if (active) {
          setState({ src: null, loading: false });
        }
      });

    return () => {
      active = false;
    };
  }, [cacheKey, entry.id, entry.title, entry.wikiPage]);

  return state;
}

function initials(title: string) {
  return title
    .replace(/[:&*]/g, " ")
    .split(" ")
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function TimelineCard({
  entry,
  index,
  isMatch,
  query,
}: {
  entry: TimelineEntry;
  index: number;
  isMatch: boolean;
  query: string;
}) {
  const { src, loading } = useTimelineImage(entry);

  return (
    <article
      className={`timeline-card ${isMatch ? "is-match" : "is-muted"}`}
      data-entry-id={entry.id}
      style={{ "--card-index": index } as CSSProperties}
    >
      <div className="card-media" aria-label={`${entry.title} image`}>
        {src ? (
          <img src={src} alt={`${entry.title} artwork`} loading={index < 8 ? "eager" : "lazy"} />
        ) : (
          <div className={`image-fallback ${loading ? "is-loading" : ""}`}>{initials(entry.title)}</div>
        )}
      </div>
      <div className="card-copy">
        <div className="card-kicker">
          <span>{entry.yearLabel}</span>
          <span>{entry.medium}</span>
        </div>
        <h2>{entry.title}</h2>
        <p className="chapter">{entry.chapter}</p>
        <p className="event">{entry.event}</p>
        <p className="impact">{entry.impact}</p>
      </div>
      {query && isMatch ? <span className="match-mark">match</span> : null}
    </article>
  );
}

export default function App() {
  const [query, setQuery] = useState("");
  const [progress, setProgress] = useState(0);
  const shellRef = useRef<HTMLElement | null>(null);
  const pinRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const metricsRef = useRef({ sectionTop: 0, sectionHeight: 0, travel: 0 });

  const matches = useMemo(
    () => timelineEntries.map((entry) => entryMatches(entry, query)),
    [query],
  );

  const visibleCount = matches.filter(Boolean).length;

  const measure = useCallback(() => {
    const shell = shellRef.current;
    const track = trackRef.current;
    if (!shell || !track) {
      return;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const trackWidth = track.scrollWidth;
    const travel = Math.max(trackWidth - viewportWidth, 0);
    const sectionHeight = Math.max(travel + viewportHeight, viewportHeight * 1.6);

    shell.style.height = `${sectionHeight}px`;
    metricsRef.current = {
      sectionTop: shell.offsetTop,
      sectionHeight,
      travel,
    };
  }, []);

  const updateScroll = useCallback(() => {
    const { sectionTop, sectionHeight, travel } = metricsRef.current;
    const span = Math.max(sectionHeight - window.innerHeight, 1);
    const nextProgress = Math.min(Math.max((window.scrollY - sectionTop) / span, 0), 1);
    const eased = nextProgress * nextProgress * (3 - 2 * nextProgress);

    setProgress(nextProgress);

    if (trackRef.current) {
      trackRef.current.style.transform = `translate3d(${-travel * eased}px, 0, 0)`;
      trackRef.current.style.setProperty("--scroll-progress", String(nextProgress));
    }
  }, []);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateScroll);
    };
    const onResize = () => {
      measure();
      updateScroll();
    };

    measure();
    updateScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [measure, updateScroll]);

  const jumpToEntry = useCallback((entryId: string) => {
    const shell = shellRef.current;
    const track = trackRef.current;
    const card = track?.querySelector<HTMLElement>(`[data-entry-id="${entryId}"]`);
    if (!shell || !track || !card) {
      return;
    }

    measure();
    const { travel, sectionTop, sectionHeight } = metricsRef.current;
    const targetX = Math.max(card.offsetLeft - window.innerWidth * 0.18, 0);
    const nextProgress = travel > 0 ? Math.min(targetX / travel, 1) : 0;
    const targetY = sectionTop + nextProgress * Math.max(sectionHeight - window.innerHeight, 1);
    const eased = nextProgress * nextProgress * (3 - 2 * nextProgress);

    track.style.transform = `translate3d(${-travel * eased}px, 0, 0)`;
    track.style.setProperty("--scroll-progress", String(nextProgress));
    setProgress(nextProgress);
    window.scrollTo({ top: targetY, behavior: "auto" });
    window.requestAnimationFrame(updateScroll);
  }, [measure, updateScroll]);

  useEffect(() => {
    if (!query.trim()) {
      return;
    }

    const timeout = window.setTimeout(() => {
      const firstMatch = timelineEntries.find((entry) => entryMatches(entry, query));
      if (firstMatch) {
        jumpToEntry(firstMatch.id);
      }
    }, 240);

    return () => window.clearTimeout(timeout);
  }, [jumpToEntry, query]);

  useEffect(() => {
    const onKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };

    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, []);

  return (
    <main className="app">
      <SpaceCanvas />
      <div className="space-vignette" aria-hidden="true" />

      <header className="site-header">
        <a className="marvel-mark" href="#timeline" aria-label="Marvel Cosmic Timeline">
          MARVEL
        </a>
        <div className="search-shell">
          <Search aria-hidden="true" size={18} strokeWidth={1.7} />
          <input
            ref={searchRef}
            value={query}
            type="search"
            aria-label="Search by Marvel title or timeline event"
            placeholder="Search the timeline"
            onChange={(event) => setQuery(event.target.value)}
          />
          {query ? (
            <button className="icon-button" type="button" aria-label="Clear search" onClick={() => setQuery("")}>
              <X size={16} strokeWidth={1.8} />
            </button>
          ) : null}
        </div>
      </header>

      <section className="intro" aria-label="Marvel timeline overview">
        <p>MCU and Marvel TV chronology</p>
        <h1>One continuous screen timeline from Wakanda's first shadows to the multiverse era.</h1>
        <div className="intro-meta">
          <span>{timelineEntries.length} titles</span>
          <span>Movies and TV only</span>
          <span>Chronological order</span>
        </div>
      </section>

      <section id="timeline" className="timeline-shell" ref={shellRef} aria-label="Horizontal Marvel timeline">
        <div className="timeline-pin" ref={pinRef}>
          <div className="timeline-status" aria-live="polite">
            <span>{query ? `${visibleCount} match${visibleCount === 1 ? "" : "es"}` : "Sacred timeline"}</span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
          <nav className="year-rail" aria-label="Timeline quick jump">
            {timelineEntries.map((entry, index) => (
              <button
                key={entry.id}
                type="button"
                className={matches[index] ? "" : "is-muted"}
                onClick={() => jumpToEntry(entry.id)}
              >
                <span>{entry.yearLabel}</span>
              </button>
            ))}
          </nav>
          <div className="timeline-track" ref={trackRef}>
            {timelineEntries.map((entry, index) => (
              <TimelineCard key={entry.id} entry={entry} index={index} isMatch={matches[index]} query={query} />
            ))}
            <article className="timeline-card closing-card" aria-label="End of timeline">
              <div className="closing-line">
                <span>Continue watching the skies</span>
                <ArrowRight size={20} strokeWidth={1.5} />
              </div>
              <p>
                Timeline order follows Marvel's Disney+ Complete MCU Timeline article published June 2, 2026, with
                Marvel Television seasons placed where they connect to the larger chronology.
              </p>
              <a href="https://www.marvel.com/articles/movies/mcu-timeline-order-disney-plus">Source</a>
            </article>
          </div>
        </div>
      </section>
    </main>
  );
}
