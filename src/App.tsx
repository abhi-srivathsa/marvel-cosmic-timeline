import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { Search, Volume2, VolumeX, X } from "lucide-react";
import { posterImages } from "./data/posterImages";
import { storyTimelineEntries, type StoryTimelineEntry } from "./data/storyTimeline";
import { timelineEntries, type TimelineEntry } from "./data/timeline";

type ViewMode = "titles" | "story";
type TimelineViewEntry =
  | TimelineEntry
  | (StoryTimelineEntry & {
      wikiPage?: string;
    });

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function entryMatches(entry: TimelineViewEntry, query: string) {
  const normalizedQuery = normalize(query);

  if (!normalizedQuery) {
    return false;
  }

  const haystack = normalize(
    [
      entry.title,
      entry.medium,
      entry.yearLabel,
      entry.chapter,
      entry.event,
      entry.impact,
      ...entry.tags,
      ...("connections" in entry ? entry.connections : []),
    ].join(" "),
  );

  return normalizedQuery.split(" ").every((part) => haystack.includes(part));
}

function posterFor(entry: TimelineViewEntry) {
  const posterId = "posterId" in entry ? entry.posterId : entry.id;
  return posterImages[posterId as keyof typeof posterImages] ?? posterImages["the-avengers"];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function smoothStep(value: number) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

const desktopRenderRange = 4;
const mobileRenderRange = 2;

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>("titles");
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [motionProgress, setMotionProgress] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1440 : window.innerWidth,
  );
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioPausedByUserRef = useRef(false);
  const progressRef = useRef(0);
  const targetProgressRef = useRef(0);
  const animationFrameRef = useRef(0);
  const snapTimeoutRef = useRef<number | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const viewEntries: TimelineViewEntry[] = viewMode === "story" ? storyTimelineEntries : timelineEntries;
  const maxIndex = Math.max(viewEntries.length - 1, 0);
  const activeEntry = viewEntries[clamp(activeIndex, 0, maxIndex)] ?? timelineEntries[0];
  const isMobile = viewportWidth < 760;
  const renderedEntries = useMemo(() => {
    const renderRange = isMobile ? mobileRenderRange : desktopRenderRange;
    const motionIndex = Math.round(motionProgress);

    return viewEntries
      .map((entry, index) => ({ entry, index }))
      .filter(
        ({ index }) =>
          Math.abs(index - activeIndex) <= renderRange ||
          Math.abs(index - motionIndex) <= renderRange,
      );
  }, [activeIndex, isMobile, motionProgress, viewEntries]);

  const suggestions = useMemo(() => {
    if (!query.trim()) {
      return [];
    }

    return viewEntries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entryMatches(entry, query))
      .slice(0, 8);
  }, [query, viewEntries]);

  const scrollToIndex = (index: number) => {
    const nextIndex = clamp(index, 0, viewEntries.length - 1);
    const jumpDistance = Math.abs(nextIndex - progressRef.current);
    targetProgressRef.current = nextIndex;
    setActiveIndex(nextIndex);

    if (jumpDistance > desktopRenderRange) {
      progressRef.current = nextIndex;
      setMotionProgress(nextIndex);
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = 0;
      return;
    }

    if (!animationFrameRef.current) {
      animationFrameRef.current = window.requestAnimationFrame(animateProgress);
    }
  };

  const queueSnapToEvent = () => {
    if (snapTimeoutRef.current) {
      window.clearTimeout(snapTimeoutRef.current);
    }

    snapTimeoutRef.current = window.setTimeout(() => {
      snapTimeoutRef.current = null;
      targetProgressRef.current = clamp(Math.round(targetProgressRef.current), 0, maxIndex);

      if (!animationFrameRef.current) {
        animationFrameRef.current = window.requestAnimationFrame(animateProgress);
      }
    }, 140);
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
    let pointerStartY = 0;
    let pointerStartX = 0;
    let pointerDragging = false;
    let mouseStartY = 0;
    let mouseStartX = 0;
    let mouseDragging = false;

    const targetAllowsTimelineGesture = (target: EventTarget | null) => {
      const element = target instanceof Element ? target : null;

      return !element?.closest(".search-area, .view-switch, .sound-toggle, .timeline-dot");
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
      targetProgressRef.current = clamp(targetProgressRef.current + delta / 620, 0, maxIndex);
      queueSnapToEvent();

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
      queueSnapToEvent();

      if (!animationFrameRef.current) {
        animationFrameRef.current = window.requestAnimationFrame(animateProgress);
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (
        event.pointerType === "touch" ||
        !targetAllowsTimelineGesture(event.target) ||
        (event.pointerType === "mouse" && event.button !== 0)
      ) {
        return;
      }

      pointerStartY = event.clientY;
      pointerStartX = event.clientX;
      pointerDragging = true;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!pointerDragging) {
        return;
      }

      const deltaY = pointerStartY - event.clientY;
      const deltaX = pointerStartX - event.clientX;
      const dominantDelta = Math.abs(deltaY) > Math.abs(deltaX) ? deltaY : deltaX;

      if (Math.abs(dominantDelta) < 2) {
        return;
      }

      event.preventDefault();
      targetProgressRef.current = clamp(targetProgressRef.current + dominantDelta / 300, 0, maxIndex);
      pointerStartY = event.clientY;
      pointerStartX = event.clientX;
      queueSnapToEvent();

      if (!animationFrameRef.current) {
        animationFrameRef.current = window.requestAnimationFrame(animateProgress);
      }
    };

    const onPointerEnd = () => {
      pointerDragging = false;
    };

    const onMouseDown = (event: MouseEvent) => {
      if (pointerDragging || !targetAllowsTimelineGesture(event.target) || event.button !== 0) {
        return;
      }

      mouseStartY = event.clientY;
      mouseStartX = event.clientX;
      mouseDragging = true;
    };

    const onMouseMove = (event: MouseEvent) => {
      if (!mouseDragging || pointerDragging) {
        return;
      }

      const deltaY = mouseStartY - event.clientY;
      const deltaX = mouseStartX - event.clientX;
      const dominantDelta = Math.abs(deltaY) > Math.abs(deltaX) ? deltaY : deltaX;

      if (Math.abs(dominantDelta) < 2) {
        return;
      }

      event.preventDefault();
      targetProgressRef.current = clamp(targetProgressRef.current + dominantDelta / 300, 0, maxIndex);
      mouseStartY = event.clientY;
      mouseStartX = event.clientX;
      queueSnapToEvent();

      if (!animationFrameRef.current) {
        animationFrameRef.current = window.requestAnimationFrame(animateProgress);
      }
    };

    const onMouseEnd = () => {
      mouseDragging = false;
    };

    const onResize = () => {
      setViewportWidth(window.innerWidth);
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseEnd);
    window.addEventListener("resize", onResize);

    return () => {
      if (snapTimeoutRef.current) {
        window.clearTimeout(snapTimeoutRef.current);
        snapTimeoutRef.current = null;
      }
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = 0;
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseEnd);
      window.removeEventListener("resize", onResize);
    };
  }, [maxIndex]);

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
        scrollToIndex(clamp(activeIndex + 1, 0, maxIndex));
      }

      if (event.key === "ArrowLeft") {
        scrollToIndex(clamp(activeIndex - 1, 0, maxIndex));
      }
    };

    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [activeIndex, maxIndex]);

  const selectSuggestion = (index: number) => {
    scrollToIndex(index);
    setQuery(viewEntries[index].title);
    setSuggestionsOpen(false);
    searchRef.current?.blur();
  };

  const changeViewMode = (mode: ViewMode) => {
    if (mode === viewMode) {
      return;
    }

    setViewMode(mode);
    setActiveIndex(0);
    setQuery("");
    setSuggestionsOpen(false);
    targetProgressRef.current = 0;
    progressRef.current = 0;
    setMotionProgress(0);
    window.cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = 0;
  };

  const progressPercent = maxIndex > 0 ? Math.round((activeIndex / maxIndex) * 100) : 0;
  return (
    <main className={`app is-${viewMode}-view`}>
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
        preload="none"
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
                aria-label="Search by Marvel story, event, movie, or TV show"
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
          <div className="view-switch" role="tablist" aria-label="Timeline view">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "titles"}
              className={viewMode === "titles" ? "is-active" : ""}
              onClick={() => changeViewMode("titles")}
            >
              Titles
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "story"}
              className={viewMode === "story" ? "is-active" : ""}
              onClick={() => changeViewMode("story")}
            >
              Story
            </button>
          </div>
        </div>

        <div className="timeline-viewport" ref={viewportRef}>
          <div className="timeline-track" ref={trackRef}>
            {renderedEntries.map(({ entry, index }) => {
              const local = motionProgress - index;
              const distance = Math.abs(local);
              const enterSide = index % 2 === 0 ? -1 : 1;
              const focus = clamp(1 - distance / 0.72, 0, 1);
              const approach = smoothStep((local + 1.35) / 1.35);
              const pass = smoothStep(local / 1.05);
              const sideDistance = isMobile ? 8 : 28;
              const passDistance = isMobile ? 8 : 17;
              const x = enterSide * (approach * sideDistance + pass * passDistance);
              const y = local < 0 ? -18 + approach * 20 : 2 + pass * (isMobile ? 24 : 28);
              const scale = local < 0 ? 0.42 + approach * 0.58 : 1 + pass * 0.16;
              const enteringOpacity = smoothStep((local + 1.28) / 0.58);
              const exitingOpacity = 1 - smoothStep((local - 0.76) / 0.42);
              const opacity = clamp(enteringOpacity * exitingOpacity, 0, 1);
              const focusClass =
                index === activeIndex ? "is-active" : local > -1.28 && local < 1.08 ? "is-neighbor" : "is-distant";
              const focusStyle = {
                opacity,
                zIndex: index === activeIndex ? 1200 : Math.round(900 - distance * 20 + (local > 0 ? 40 : 0)),
                pointerEvents: focus > 0.45 ? "auto" : "none",
                transform: `translate3d(calc(-50% + ${x}vw), calc(-50% + ${y}vh), 0) scale(${scale})`,
                "--focus": focus,
                "--slide-side": enterSide,
              } as CSSProperties & Record<string, string | number>;

              return (
                <article
                  key={entry.id}
                  className={`timeline-card ${focusClass} ${index % 2 === 0 ? "is-left-slide" : "is-right-slide"}`}
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
                    {"connections" in entry ? (
                      <div className="connection-chain" aria-label="Connected titles">
                        {entry.connections.map((connection) => (
                          <span key={connection}>{connection}</span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div className="timeline-axis" aria-label="Timeline entries">
          <div className="timeline-axis-line" aria-hidden="true" />
          <div className="timeline-dots">
            {viewEntries.map((entry, index) => {
              const local = index - motionProgress;
              const pathDepth = clamp((local + 0.8) / (isMobile ? 8 : 11), 0, 1);
              const easedDepth = smoothStep(pathDepth);
              const dotTop = (isMobile ? 73 : 76) - easedDepth * (isMobile ? 42 : 48);
              const distance = Math.abs(local);
              const isActive = index === activeIndex;
              const visible = local > -1.15 && local < (isMobile ? 9 : 13);
              return (
                <button
                  key={entry.id}
                  type="button"
                  className={`timeline-dot ${isActive ? "is-active" : ""}`}
                  style={{
                    top: `${dotTop}%`,
                    opacity: visible ? clamp(1 - pathDepth * 0.74 - Math.max(-local - 0.2, 0) * 0.55, 0.18, 1) : 0,
                    zIndex: Math.round(300 - pathDepth * 180),
                    "--dot-scale": isActive ? 1.95 : clamp(1.25 - pathDepth * 0.88, 0.34, 1),
                  } as CSSProperties & { "--dot-scale": number }}
                  aria-label={`Go to ${entry.title}`}
                  onClick={() => scrollToIndex(index)}
                >
                  <span />
                </button>
              );
            })}
          </div>
        </div>

        <div className="timeline-percent" aria-hidden="true">[{progressPercent}%]</div>
      </section>
    </main>
  );
}
