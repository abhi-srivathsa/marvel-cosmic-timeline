import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { posterImages } from "./data/posterImages";
import { timelineEntries, type TimelineEntry } from "./data/timeline";

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function entryMatches(entry: TimelineEntry, query: string) {
  const normalizedQuery = normalize(query);

  if (!normalizedQuery) {
    return false;
  }

  const haystack = normalize(
    [entry.title, entry.medium, entry.yearLabel, entry.chapter, entry.event, entry.impact, ...entry.tags].join(" "),
  );

  return normalizedQuery.split(" ").every((part) => haystack.includes(part));
}

function posterFor(entry: TimelineEntry) {
  return posterImages[entry.id as keyof typeof posterImages];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function centerCard(viewport: HTMLDivElement, card: HTMLElement, behavior: ScrollBehavior = "smooth") {
  const nextLeft = card.offsetLeft - viewport.clientWidth / 2 + card.clientWidth / 2;

  if (behavior === "auto") {
    viewport.scrollLeft = nextLeft;
    return;
  }

  viewport.scrollLeft = nextLeft;
  viewport.scrollTo({ left: nextLeft, behavior });
}

function timelineWindow(index: number) {
  const pointIndexes = index === 0 ? [0, 1] : [index - 1, index, index + 1];

  return pointIndexes
    .filter((item) => item >= 0 && item < timelineEntries.length)
    .map((item) => ({ index: item, role: item < index ? "previous" : item > index ? "next" : "current" }));
}

type RibbonMarker = {
  index: number;
  role: string;
  x: number;
};

type RibbonState = {
  ready: boolean;
  y: number;
  lineLeft: number;
  lineRight: number;
  fadeLeft: boolean;
  fadeRight: boolean;
  markers: RibbonMarker[];
};

export default function App() {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [ribbonState, setRibbonState] = useState<RibbonState>({
    ready: false,
    y: 0,
    lineLeft: 0,
    lineRight: 0,
    fadeLeft: false,
    fadeRight: false,
    markers: [],
  });
  const trackRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);

  const suggestions = useMemo(() => {
    if (!query.trim()) {
      return [];
    }

    return timelineEntries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entryMatches(entry, query))
      .slice(0, 8);
  }, [query]);

  const scrollToIndex = (index: number) => {
    const viewport = viewportRef.current;
    const card = cardRefs.current[index];

    if (!viewport || !card) {
      return;
    }

    centerCard(viewport, card);
    setActiveIndex(index);
  };

  const updateRibbon = (index: number) => {
    const activeCard = cardRefs.current[index];
    const poster = activeCard?.querySelector<HTMLElement>(".poster-frame");
    const copy = activeCard?.querySelector<HTMLElement>(".card-copy");

    if (!activeCard || !poster || !copy) {
      return;
    }

    const posterRect = poster.getBoundingClientRect();
    const copyRect = copy.getBoundingClientRect();
    const y = posterRect.bottom + (copyRect.top - posterRect.bottom) / 2;
    const viewportWidth = window.innerWidth;

    const markers = timelineWindow(index)
      .map((point) => {
        const card = cardRefs.current[point.index];

        if (!card) {
          return null;
        }

        const rect = card.getBoundingClientRect();
        return {
          index: point.index,
          role: point.role,
          x: rect.left + rect.width / 2,
        };
      })
      .filter((marker): marker is RibbonMarker => Boolean(marker));

    const current = markers.find((marker) => marker.role === "current");

    if (!current) {
      return;
    }

    const previous = markers.find((marker) => marker.role === "previous");
    const next = markers.find((marker) => marker.role === "next");
    const fadeMargin = 24;
    const lineLeft = previous ? (previous.x < fadeMargin ? 0 : previous.x) : current.x;
    const lineRight = next ? (next.x > viewportWidth - fadeMargin ? viewportWidth : next.x) : current.x;
    const visibleMarkers = markers.filter((marker) => marker.x >= -fadeMargin && marker.x <= viewportWidth + fadeMargin);

    setRibbonState({
      ready: true,
      y,
      lineLeft: Math.max(0, Math.min(lineLeft, viewportWidth)),
      lineRight: Math.max(0, Math.min(lineRight, viewportWidth)),
      fadeLeft: Boolean(previous && previous.x < fadeMargin),
      fadeRight: Boolean(next && next.x > viewportWidth - fadeMargin),
      markers: visibleMarkers,
    });
  };

  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    let frame = 0;
    const updateActive = () => {
      const center = viewport.scrollLeft + viewport.clientWidth / 2;
      let closestIndex = 0;
      let closestDistance = Number.POSITIVE_INFINITY;

      cardRefs.current.forEach((card, index) => {
        if (!card) {
          return;
        }

        const cardCenter = card.offsetLeft + card.clientWidth / 2;
        const distance = Math.abs(cardCenter - center);

        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });

      setActiveIndex(closestIndex);
      updateRibbon(closestIndex);
    };

    const onScroll = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateActive);
    };

    const onWheel = (event: WheelEvent) => {
      const target = event.target instanceof Element ? event.target : null;

      if (target?.closest(".search-dropdown")) {
        return;
      }

      const delta = event.deltaY !== 0 ? event.deltaY : event.deltaX;

      if (!delta) {
        return;
      }

      event.preventDefault();
      viewport.scrollLeft += delta;
      onScroll();
    };

    frame = window.requestAnimationFrame(() => {
      const firstCard = cardRefs.current[0];

      if (firstCard) {
        centerCard(viewport, firstCard, "auto");
      }

      updateActive();
    });
    const interval = window.setInterval(updateActive, 120);
    viewport.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", onScroll);

    return () => {
      window.clearInterval(interval);
      window.cancelAnimationFrame(frame);
      viewport.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  useEffect(() => {
    const onKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }

      if (event.key === "ArrowRight") {
        scrollToIndex(clamp(activeIndex + 1, 0, timelineEntries.length - 1));
      }

      if (event.key === "ArrowLeft") {
        scrollToIndex(clamp(activeIndex - 1, 0, timelineEntries.length - 1));
      }
    };

    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [activeIndex]);

  const selectSuggestion = (index: number) => {
    scrollToIndex(index);
    setQuery(timelineEntries[index].title);
    setSuggestionsOpen(false);
    searchRef.current?.blur();
  };

  return (
    <main className="app">
      <div className="background-art" aria-hidden="true" />
      <div className="background-wash" aria-hidden="true" />

      <header className="site-header">
        <a className="marvel-logo" href="#timeline" aria-label="Marvel timeline home">
          <img src="/brand/marvel-logo-cropped.webp" alt="Marvel" />
        </a>

        <div className="search-area">
          <div className="search-shell">
            <Search aria-hidden="true" size={18} strokeWidth={1.6} />
            <input
              ref={searchRef}
              value={query}
              type="search"
              aria-label="Search by Marvel event, movie, or TV show"
              placeholder="Search timeline"
              onChange={(event) => {
                setQuery(event.target.value);
                setSuggestionsOpen(true);
              }}
              onFocus={() => setSuggestionsOpen(true)}
            />
            {query ? (
              <button
                className="icon-button"
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  setSuggestionsOpen(false);
                }}
              >
                <X size={16} strokeWidth={1.8} />
              </button>
            ) : null}
          </div>

          {suggestionsOpen && query.trim() ? (
            <div className="search-dropdown">
              {suggestions.length ? (
                suggestions.map(({ entry, index }) => (
                  <button key={entry.id} type="button" onClick={() => selectSuggestion(index)}>
                    <span>{entry.title}</span>
                    <small>{entry.yearLabel} / {entry.medium}</small>
                  </button>
                ))
              ) : (
                <div className="no-results">No matches</div>
              )}
            </div>
          ) : null}
        </div>
      </header>

      <section id="timeline" className="timeline-stage" aria-label="Horizontal Marvel timeline">
        <div className="timeline-heading" aria-label="Timeline overview">
          <p>Marvel screen chronology</p>
          <h1>MCU and Marvel TV timeline</h1>
        </div>

        <div className="timeline-viewport" ref={viewportRef}>
          <div className="timeline-track" ref={trackRef}>
            {timelineEntries.map((entry, index) => {
              const distance = Math.abs(activeIndex - index);
              const focusClass = distance === 0 ? "is-active" : distance === 1 ? "is-neighbor" : "is-distant";
              const focusStyle = {
                opacity: distance === 0 ? 1 : distance === 1 ? 0.45 : 0.18,
                transform: `scale(${distance === 0 ? 1 : distance === 1 ? 0.88 : 0.78})`,
                filter: distance === 0 ? "saturate(1) blur(0)" : distance === 1 ? "saturate(0.82) blur(0)" : "saturate(0.72) blur(0.5px)",
              } as CSSProperties;

              return (
                <article
                  key={entry.id}
                  className={`timeline-card ${focusClass}`}
                  data-entry-id={entry.id}
                  style={focusStyle}
                  ref={(node) => {
                    cardRefs.current[index] = node;
                  }}
                  aria-label={`${entry.title} timeline event`}
                >
                  <figure className="poster-frame">
                    <img src={posterFor(entry)} alt={`${entry.title} official poster`} loading={distance < 4 ? "eager" : "lazy"} />
                  </figure>

                  <div className="card-copy">
                    <div className="event-meta">
                      <span>{entry.yearLabel}</span>
                      <span>{entry.medium}</span>
                    </div>
                    <h2>{entry.title}</h2>
                    <p className="chapter">{entry.chapter}</p>
                    <p className="event-text">{entry.event}</p>
                    <p className="impact">{entry.impact}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div
          className={`timeline-ribbon ${ribbonState.ready ? "is-ready" : ""} ${ribbonState.fadeLeft ? "has-fade-left" : ""} ${
            ribbonState.fadeRight ? "has-fade-right" : ""
          }`}
          style={{ top: `${ribbonState.y}px` }}
          aria-label="Visible timeline progress"
        >
          <div
            className="ribbon-line"
            style={{
              left: `${Math.min(ribbonState.lineLeft, ribbonState.lineRight)}px`,
              width: `${Math.abs(ribbonState.lineRight - ribbonState.lineLeft)}px`,
            }}
          />
          {ribbonState.markers.map((marker) => (
            <button
              key={timelineEntries[marker.index].id}
              className={`ribbon-point is-${marker.role}`}
              type="button"
              style={{ left: `${marker.x}px` }}
              aria-label={`Go to ${timelineEntries[marker.index].title}`}
              onClick={() => scrollToIndex(marker.index)}
            >
              <span />
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
