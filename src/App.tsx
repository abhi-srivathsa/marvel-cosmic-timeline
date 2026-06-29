import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { Search, Volume2, VolumeX, X } from "lucide-react";
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

function mix(start: number, end: number, amount: number) {
  return start + (end - start) * amount;
}

function smoothStep(value: number) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

const depthLanes = [
  { x: 13, y: -3, exitX: 10, rotateY: -7, rotateX: 1.5 },
  { x: -18, y: 1, exitX: -8, rotateY: 8, rotateX: -1 },
  { x: 4, y: -7, exitX: -4, rotateY: -2, rotateX: 2.2 },
  { x: 20, y: 5, exitX: 12, rotateY: -10, rotateX: -1.8 },
  { x: -8, y: 6, exitX: -13, rotateY: 5, rotateX: 1.2 },
  { x: 0, y: -1, exitX: 0, rotateY: 0, rotateX: 0 },
];

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
  y: number;
  scale: number;
  opacity: number;
};

type RibbonState = {
  ready: boolean;
  lineLeft: number;
  lineTop: number;
  lineLength: number;
  lineAngle: number;
  fadeLeft: boolean;
  fadeRight: boolean;
  markers: RibbonMarker[];
};

export default function App() {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [motionProgress, setMotionProgress] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1440 : window.innerWidth,
  );
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [ribbonState, setRibbonState] = useState<RibbonState>({
    ready: false,
    lineLeft: 0,
    lineTop: 0,
    lineLength: 0,
    lineAngle: 0,
    fadeLeft: false,
    fadeRight: false,
    markers: [],
  });
  const trackRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioPausedByUserRef = useRef(false);
  const progressRef = useRef(0);
  const targetProgressRef = useRef(0);
  const animationFrameRef = useRef(0);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const activeEntry = timelineEntries[activeIndex];
  const maxIndex = timelineEntries.length - 1;

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
    const nextIndex = clamp(index, 0, maxIndex);
    targetProgressRef.current = nextIndex;
    setActiveIndex(nextIndex);

    if (!animationFrameRef.current) {
      animationFrameRef.current = window.requestAnimationFrame(animateProgress);
    }
  };

  const playBackgroundAudio = async () => {
    const audio = audioRef.current;

    if (!audio || audioPausedByUserRef.current) {
      return;
    }

    audio.volume = 0.34;

    try {
      await audio.play();
      setIsAudioPlaying(true);
    } catch {
      setIsAudioPlaying(false);
    }
  };

  const toggleBackgroundAudio = () => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    if (audio.paused) {
      audioPausedByUserRef.current = false;
      void playBackgroundAudio();
      return;
    }

    audioPausedByUserRef.current = true;
    audio.pause();
    setIsAudioPlaying(false);
  };

  const updateRibbon = (index: number) => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const mobile = width < 760;

    const markers = timelineWindow(index).map((point) => {
      const isLandingPair = index === 0;
      const rail = mobile
        ? {
            previous: { x: 26, y: height * 0.8, scale: 0.64, opacity: 0.34 },
            current: { x: 52, y: height * 0.74, scale: 1, opacity: 1 },
            next: { x: isLandingPair ? 105 : 118, y: height * 0.64, scale: 0.56, opacity: 0.46 },
          }
        : {
            previous: { x: 44, y: height * 0.78, scale: 0.62, opacity: 0.32 },
            current: { x: 92, y: height * 0.68, scale: 1, opacity: 1 },
            next: { x: isLandingPair ? 185 : 210, y: height * 0.53, scale: 0.54, opacity: 0.42 },
          };

      const position = rail[point.role as keyof typeof rail];

      return {
        index: point.index,
        role: point.role,
        x: clamp(position.x, 18, width - 18),
        y: position.y,
        scale: position.scale,
        opacity: position.opacity,
      };
    });

    const current = markers.find((marker) => marker.role === "current");

    if (!current) {
      return;
    }

    const previous = markers.find((marker) => marker.role === "previous");
    const next = markers.find((marker) => marker.role === "next");
    const start = markers[0];
    const end = markers[markers.length - 1];
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;

    setRibbonState({
      ready: true,
      lineLeft: start.x,
      lineTop: start.y,
      lineLength: Math.hypot(deltaX, deltaY),
      lineAngle: (Math.atan2(deltaY, deltaX) * 180) / Math.PI,
      fadeLeft: Boolean(previous),
      fadeRight: Boolean(next),
      markers,
    });
  };

  const animateProgress = () => {
    const distance = targetProgressRef.current - progressRef.current;

    if (Math.abs(distance) < 0.002) {
      progressRef.current = targetProgressRef.current;
      setMotionProgress(progressRef.current);
      setActiveIndex(Math.round(progressRef.current));
      animationFrameRef.current = 0;
      return;
    }

    progressRef.current += distance * 0.11;
    setMotionProgress(progressRef.current);
    setActiveIndex(Math.round(progressRef.current));
    animationFrameRef.current = window.requestAnimationFrame(animateProgress);
  };

  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    let touchStartY = 0;
    let touchStartX = 0;

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
      targetProgressRef.current = clamp(targetProgressRef.current + delta / 620, 0, maxIndex);

      if (!animationFrameRef.current) {
        animationFrameRef.current = window.requestAnimationFrame(animateProgress);
      }
    };

    const onTouchStart = (event: TouchEvent) => {
      touchStartY = event.touches[0]?.clientY ?? 0;
      touchStartX = event.touches[0]?.clientX ?? 0;
    };

    const onTouchMove = (event: TouchEvent) => {
      const target = event.target instanceof Element ? event.target : null;

      if (target?.closest(".search-dropdown")) {
        return;
      }

      const touch = event.touches[0];

      if (!touch) {
        return;
      }

      const deltaY = touchStartY - touch.clientY;
      const deltaX = touchStartX - touch.clientX;
      const dominantDelta = Math.abs(deltaY) > Math.abs(deltaX) ? deltaY : deltaX;

      if (Math.abs(dominantDelta) < 2) {
        return;
      }

      event.preventDefault();
      targetProgressRef.current = clamp(targetProgressRef.current + dominantDelta / 260, 0, maxIndex);
      touchStartY = touch.clientY;
      touchStartX = touch.clientX;

      if (!animationFrameRef.current) {
        animationFrameRef.current = window.requestAnimationFrame(animateProgress);
      }
    };

    const onResize = () => {
      setViewportWidth(window.innerWidth);
      window.requestAnimationFrame(() => updateRibbon(Math.round(progressRef.current)));
    };

    const ribbonFrame = window.requestAnimationFrame(() => updateRibbon(0));
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("resize", onResize);

    return () => {
      window.cancelAnimationFrame(ribbonFrame);
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = 0;
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("resize", onResize);
    };
  }, [maxIndex]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => updateRibbon(activeIndex));
    return () => window.cancelAnimationFrame(frame);
  }, [activeIndex, motionProgress, viewportWidth]);

  useEffect(() => {
    const startAudio = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;

      if (target?.closest(".sound-toggle")) {
        return;
      }

      void playBackgroundAudio();
    };

    void playBackgroundAudio();
    window.addEventListener("pointerdown", startAudio, { once: true });
    window.addEventListener("keydown", startAudio, { once: true });
    window.addEventListener("wheel", startAudio, { once: true, passive: true });
    window.addEventListener("touchstart", startAudio, { once: true, passive: true });

    return () => {
      window.removeEventListener("pointerdown", startAudio);
      window.removeEventListener("keydown", startAudio);
      window.removeEventListener("wheel", startAudio);
      window.removeEventListener("touchstart", startAudio);
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

  const progressPercent = Math.round((activeIndex / maxIndex) * 100);
  return (
    <main className="app">
      <div
        className="background-art"
        aria-hidden="true"
        style={{
          transform: `scale(1.08) translate3d(${Math.sin(motionProgress * 0.38) * -18}px, ${
            Math.cos(motionProgress * 0.22) * 8
          }px, 0)`,
        }}
      />
      <div className="background-wash" aria-hidden="true" />
      <div className="cosmic-vectors" aria-hidden="true" />
      <audio
        ref={audioRef}
        src="/audio/the-avengers-ending.mp3"
        loop
        preload="auto"
        onPlay={() => setIsAudioPlaying(true)}
        onPause={() => setIsAudioPlaying(false)}
      />

      <header className="site-header">
        <a className="marvel-logo" href="#timeline" aria-label="Marvel timeline home">
          <img src="/brand/marvel-logo-cropped.webp" alt="Marvel" />
        </a>

        <div className="header-actions">
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

          <button
            className="sound-toggle"
            type="button"
            aria-label={isAudioPlaying ? "Pause background music" : "Play background music"}
            title={isAudioPlaying ? "Pause background music" : "Play background music"}
            onClick={toggleBackgroundAudio}
          >
            {isAudioPlaying ? <Volume2 size={18} strokeWidth={1.7} /> : <VolumeX size={18} strokeWidth={1.7} />}
          </button>
        </div>
      </header>

      <section id="timeline" className="timeline-stage" aria-label="Horizontal Marvel timeline">
        <div className="era-backdrop" aria-hidden="true">
          <span className="era-kicker">{activeEntry.medium}</span>
          <span className="era-year">{activeEntry.yearLabel}</span>
          <span className="era-title">{activeEntry.chapter}</span>
        </div>

        <div className="timeline-heading" aria-label="Timeline overview">
          <h1>Marvel Cosmic timeline</h1>
        </div>

        <div className="timeline-viewport" ref={viewportRef}>
          <div className="timeline-track" ref={trackRef}>
            {timelineEntries.map((entry, index) => {
              const local = motionProgress - index;
              const distance = Math.abs(local);
              const lane = depthLanes[index % depthLanes.length];
              const approach = smoothStep((local + 1.08) / 1.08);
              const pass = smoothStep(local / 0.82);
              const focus = clamp(1 - distance / 0.72, 0, 1);
              const enteringOpacity = smoothStep((local + 1.12) / 0.3);
              const exitingOpacity = 1 - smoothStep((local - 0.46) / 0.22);
              const opacity = clamp(enteringOpacity * exitingOpacity, 0, 1);
              const horizontalDamping = viewportWidth < 760 ? 0.28 : 1;
              const x = (mix(lane.x * 1.45, lane.x, approach) + lane.exitX * pass) * horizontalDamping;
              const y = mix(lane.y + 8, lane.y, approach) - 10 * pass;
              const z = local < 0 ? mix(-1280, 0, approach) : mix(0, 620, pass);
              const scale = local < 0 ? mix(0.78, 1, approach) : mix(1, 1.04, pass);
              const rotateY = mix(lane.rotateY * 1.4, lane.rotateY, approach) + lane.rotateY * pass * 0.8;
              const rotateX = mix(lane.rotateX * 1.2, lane.rotateX, approach) - 2 * pass;
              const focusClass =
                index === activeIndex ? "is-active" : local > -1.12 && local < 0.9 ? "is-neighbor" : "is-distant";
              const isTextFlight = index > 0 && (index % 5 === 2 || index % 6 === 4);
              const focusStyle = {
                opacity,
                zIndex: Math.round(1000 + z),
                pointerEvents: focus > 0.45 ? "auto" : "none",
                transform: `translate3d(calc(-50% + ${x}vw), calc(-50% + ${y}vh), ${z}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${scale})`,
                "--focus": focus,
                "--pass": pass,
              } as CSSProperties & Record<string, string | number>;

              return (
                <article
                  key={entry.id}
                  className={`timeline-card ${focusClass} ${isTextFlight ? "is-text-flight" : "is-image-flight"}`}
                  data-entry-id={entry.id}
                  style={focusStyle}
                  aria-label={`${entry.title} timeline event`}
                >
                  <figure className="poster-frame">
                    <img src={posterFor(entry)} alt={`${entry.title} official poster`} loading={distance < 3 ? "eager" : "lazy"} />
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
          aria-label="Visible timeline progress"
        >
          <div
            className="ribbon-line"
            style={{
              left: `${ribbonState.lineLeft}px`,
              top: `${ribbonState.lineTop}px`,
              width: `${ribbonState.lineLength}px`,
              transform: `rotate(${ribbonState.lineAngle}deg)`,
            }}
          />
          {ribbonState.markers.map((marker) => (
            <button
              key={timelineEntries[marker.index].id}
              className={`ribbon-point is-${marker.role}`}
              type="button"
              style={{
                left: `${marker.x}px`,
                top: `${marker.y}px`,
                opacity: marker.opacity,
                "--marker-scale": marker.scale,
              } as CSSProperties & { "--marker-scale": number }}
              aria-label={`Go to ${timelineEntries[marker.index].title}`}
              onClick={() => scrollToIndex(marker.index)}
            >
              <span />
            </button>
          ))}
        </div>

        <div className="timeline-percent" aria-hidden="true">[{progressPercent}%]</div>
      </section>
    </main>
  );
}
