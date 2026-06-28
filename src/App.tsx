import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { timelineEntries, type TimelineEntry } from "./data/timeline";
import { stillImages } from "./data/stillImages";

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

function imageFor(entry: TimelineEntry) {
  return stillImages[entry.id as keyof typeof stillImages];
}

function TimelineEvent({
  entry,
  index,
  activeIndex,
  register,
}: {
  entry: TimelineEntry;
  index: number;
  activeIndex: number;
  register: (index: number, node: HTMLElement | null) => void;
}) {
  const distance = Math.abs(activeIndex - index);
  const focusClass = distance === 0 ? "is-active" : distance === 1 ? "is-neighbor" : "is-distant";

  return (
    <section
      className={`timeline-event ${focusClass}`}
      ref={(node) => register(index, node)}
      data-entry-id={entry.id}
      aria-label={`${entry.title} timeline event`}
    >
      <div className="event-frame">
        <figure className="event-image">
          <img src={imageFor(entry)} alt={`${entry.title}: ${entry.chapter}`} loading={distance < 3 ? "eager" : "lazy"} />
        </figure>

        <div className="event-axis" aria-hidden="true">
          <span className="axis-line" />
          <span className="axis-dot" />
        </div>

        <article className="event-copy">
          <div className="event-meta">
            <span>{entry.yearLabel}</span>
            <span>{entry.medium}</span>
          </div>
          <h2>{entry.title}</h2>
          <p className="chapter">{entry.chapter}</p>
          <p className="event-text">{entry.event}</p>
          <p className="impact">{entry.impact}</p>
        </article>
      </div>
    </section>
  );
}

export default function App() {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const eventRefs = useRef<Array<HTMLElement | null>>([]);
  const displayKeyRef = useRef("");
  const searchRef = useRef<HTMLInputElement | null>(null);

  const displayEntries = useMemo(
    () => (query.trim() ? timelineEntries.filter((entry) => entryMatches(entry, query)) : timelineEntries),
    [query],
  );
  const visibleCount = displayEntries.length;
  const displayKey = displayEntries.map((entry) => entry.id).join("|");

  if (displayKeyRef.current !== displayKey) {
    displayKeyRef.current = displayKey;
    eventRefs.current = [];
  }

  const register = useCallback((index: number, node: HTMLElement | null) => {
    eventRefs.current[index] = node;
  }, []);

  useEffect(() => {
    const updateActive = () => {
      const center = window.innerHeight * 0.5;
      let closestIndex = 0;
      let closestDistance = Number.POSITIVE_INFINITY;

      eventRefs.current.forEach((node, index) => {
        if (!node) {
          return;
        }

        const rect = node.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height * 0.5 - center);

        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });

      setActiveIndex(closestIndex);
    };

    let frame = 0;
    const onScroll = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateActive);
    };

    updateActive();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [displayKey]);

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
      <div className="background-art" aria-hidden="true" />
      <div className="background-wash" aria-hidden="true" />

      <header className="site-header">
        <a className="marvel-logo" href="#timeline" aria-label="Marvel timeline home">
          <img src="/brand/marvel-logo-cropped.webp" alt="Marvel" />
        </a>

        <div className="search-shell">
          <Search aria-hidden="true" size={18} strokeWidth={1.6} />
          <input
            ref={searchRef}
            value={query}
            type="search"
            aria-label="Search by Marvel event, movie, or TV show"
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

      <section className="timeline-heading" aria-label="Timeline overview">
        <p>Marvel screen chronology</p>
        <h1>MCU and Marvel TV timeline</h1>
        <div className="heading-meta">
          <span>{timelineEntries.length} events</span>
          <span>{query ? `${visibleCount} match${visibleCount === 1 ? "" : "es"}` : "movies and TV shows"}</span>
        </div>
      </section>

      <div className="center-spine" aria-hidden="true">
        <span />
      </div>

      <section id="timeline" className="timeline-stack" aria-label="Vertical Marvel timeline">
        {displayEntries.length ? displayEntries.map((entry, index) => (
          <TimelineEvent
            key={entry.id}
            entry={entry}
            index={index}
            activeIndex={activeIndex}
            register={register}
          />
        )) : (
          <section className="timeline-event is-active">
            <div className="event-frame">
              <div className="event-axis" aria-hidden="true">
                <span className="axis-line" />
                <span className="axis-dot" />
              </div>
              <article className="event-copy">
                <h2>No timeline match</h2>
                <p className="event-text">Try a movie, show, character, year, or event from the Marvel screen timeline.</p>
              </article>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
