'use client';

import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowDownRight, BrainCircuit, Globe2, Layers3, Sparkles, Workflow } from 'lucide-react';

type ThemeName = 'light' | 'dark';

function readTheme(): ThemeName {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export default function ThemeHeroVideo() {
  const [theme, setTheme] = useState<ThemeName>('light');
  const [videoReady, setVideoReady] = useState(false);
  const [videoUnavailable, setVideoUnavailable] = useState(false);
  const [stillUnavailable, setStillUnavailable] = useState(false);
  const [showMotionFallback, setShowMotionFallback] = useState(false);
  const [activeDeck, setActiveDeck] = useState<0 | 1>(0);
  const videoARef = useRef<HTMLVideoElement | null>(null);
  const videoBRef = useRef<HTMLVideoElement | null>(null);
  const activeDeckRef = useRef<0 | 1>(0);
  const crossfadeRef = useRef(false);
  const crossfadeTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    setTheme(readTheme());

    const observer = new MutationObserver(() => setTheme(readTheme()));
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      observer.disconnect();
    };
  }, []);

  const isDark = theme === 'dark';
  const stillSrc = isDark ? '/assets/hero/dark-still.webp' : '/assets/hero/light-still.webp';
  const webmSrc = isDark ? '/assets/hero/dark-video.webm' : '/assets/hero/light-video.webm';
  const mp4Src = isDark ? '/assets/hero/dark-video.mp4' : '/assets/hero/light-video.mp4';

  const videoForDeck = (deck: 0 | 1) => deck === 0 ? videoARef.current : videoBRef.current;

  const beginCrossfade = (fromDeck: 0 | 1) => {
    if (crossfadeRef.current || activeDeckRef.current !== fromDeck) return;
    const nextDeck: 0 | 1 = fromDeck === 0 ? 1 : 0;
    const incoming = videoForDeck(nextDeck);
    if (!incoming) return;

    crossfadeRef.current = true;
    incoming.pause();
    try { incoming.currentTime = 0; } catch { /* Metadata may still be loading. */ }
    void incoming.play().catch(() => {
      // If the secondary decoder cannot start, keep the current frame and let
      // its error handler try WebM before falling back to the animated artwork.
      window.setTimeout(() => {
        if (crossfadeRef.current && activeDeckRef.current === fromDeck && incoming.paused) {
          crossfadeRef.current = false;
          if (incoming.error) {
            setVideoUnavailable(true);
            setShowMotionFallback(true);
          }
        }
      }, 1_500);
    });
  };

  const renderVideoDeck = (deck: 0 | 1) => {
    const videoRef = deck === 0 ? videoARef : videoBRef;
    return (
      <video
        key={mp4Src + '|' + webmSrc + '|' + deck}
        ref={videoRef}
        src={mp4Src}
        className={'landing-hero-video' + (videoReady && activeDeck === deck ? ' is-ready' : '')}
        autoPlay={deck === 0}
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
        tabIndex={-1}
        onLoadedData={() => {
          const video = videoRef.current;
          if (deck === 0 && video && video.paused) {
            void video.play().catch(() => {});
          }
        }}
        onPlaying={() => {
          if (deck === activeDeckRef.current) {
            setVideoReady(true);
            setShowMotionFallback(false);
            return;
          }
          if (!crossfadeRef.current) return;

          const outgoingDeck = activeDeckRef.current;
          activeDeckRef.current = deck;
          setActiveDeck(deck);
          setVideoReady(true);
          setShowMotionFallback(false);

          if (crossfadeTimerRef.current) window.clearTimeout(crossfadeTimerRef.current);
          crossfadeTimerRef.current = window.setTimeout(() => {
            const outgoing = videoForDeck(outgoingDeck);
            if (outgoing) {
              outgoing.pause();
              try { outgoing.currentTime = 0; } catch { /* Keep playback resilient. */ }
            }
            crossfadeRef.current = false;
            crossfadeTimerRef.current = null;
          }, 700);
        }}
        onTimeUpdate={() => {
          const video = videoRef.current;
          if (deck !== activeDeckRef.current || crossfadeRef.current || !video) return;
          if (Number.isFinite(video.duration) && video.duration > 1.5 && video.duration - video.currentTime <= 1.0) {
            beginCrossfade(deck);
          }
        }}
        onEnded={() => {
          // Fallback if timeupdate didn't fire close enough to the final frame.
          if (deck === activeDeckRef.current && !crossfadeRef.current) beginCrossfade(deck);
        }}
        onError={() => {
          const video = videoRef.current;
          if (video && !video.dataset.webmFallbackTried) {
            video.dataset.webmFallbackTried = 'true';
            video.src = webmSrc;
            video.load();
            if (deck === activeDeckRef.current || crossfadeRef.current) {
              void video.play().catch(() => {});
            }
            return;
          }
          if (deck === activeDeckRef.current || crossfadeRef.current) {
            crossfadeRef.current = false;
            setVideoUnavailable(true);
            setShowMotionFallback(true);
          }
        }}
      />
    );
  };

  useEffect(() => {
    setVideoReady(false);
    setVideoUnavailable(false);
    setStillUnavailable(false);
    setShowMotionFallback(false);
    setActiveDeck(0);
    activeDeckRef.current = 0;
    crossfadeRef.current = false;

    if (crossfadeTimerRef.current) {
      window.clearTimeout(crossfadeTimerRef.current);
      crossfadeTimerRef.current = null;
    }

    const primaryVideo = videoARef.current;
    const secondaryVideo = videoBRef.current;
    primaryVideo?.pause();
    secondaryVideo?.pause();
    if (!primaryVideo) return;

    let active = true;
    const fallbackTimer = window.setTimeout(() => {
      if (!active) return;
      if (primaryVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !primaryVideo.paused) {
        setVideoReady(true);
        setShowMotionFallback(false);
      } else {
        setShowMotionFallback(true);
      }
    }, 1800);

    primaryVideo.load();
    void primaryVideo.play().catch(() => {});

    return () => {
      active = false;
      window.clearTimeout(fallbackTimer);
      if (crossfadeTimerRef.current) window.clearTimeout(crossfadeTimerRef.current);
      primaryVideo.pause();
      secondaryVideo?.pause();
    };
  }, [webmSrc, mp4Src]);

  return (
    <div
      className={'landing-hero-visual ' + (isDark ? 'is-dark' : 'is-light') + (videoReady ? ' has-media' : '')}
      role="img"
      aria-label="UpTrendifyOS visual: public website research flows into the Brand Brain and then into marketing content."
    >
      <div className="landing-hero-visual-halo landing-hero-visual-halo-one" aria-hidden="true" />
      <div className="landing-hero-visual-halo landing-hero-visual-halo-two" aria-hidden="true" />

      {showMotionFallback && !videoReady && (
        <div className="landing-hero-visual-art" aria-hidden="true">
        <div className="landing-hero-orbit landing-hero-orbit-one" />
        <div className="landing-hero-orbit landing-hero-orbit-two" />
        <div className="landing-hero-flowline landing-hero-flowline-one" />
        <div className="landing-hero-flowline landing-hero-flowline-two" />

        <div className="landing-hero-node landing-hero-node-source">
          <span className="landing-hero-node-icon"><Globe2 size={19} /></span>
          <span className="landing-hero-node-copy">
            <strong>Website research</strong>
            <small>Public evidence in</small>
          </span>
          <span className="landing-hero-node-status"><span /> LIVE</span>
        </div>

        <div className="landing-hero-brain">
          <div className="landing-hero-brain-ring" />
          <div className="landing-hero-brain-ring landing-hero-brain-ring-two" />
          <div className="landing-hero-brain-core">
            <BrainCircuit size={78} strokeWidth={1.15} />
          </div>
          <span className="landing-hero-brain-spark landing-hero-brain-spark-one"><Sparkles size={17} /></span>
          <span className="landing-hero-brain-spark landing-hero-brain-spark-two"><Activity size={15} /></span>
        </div>

        <div className="landing-hero-node landing-hero-node-brain">
          <span className="landing-hero-node-icon"><BrainCircuit size={18} /></span>
          <span className="landing-hero-node-copy">
            <strong>Brand Brain</strong>
            <small>Evidence → trusted context</small>
          </span>
          <span className="landing-hero-node-check">✓</span>
        </div>

        <div className="landing-hero-node landing-hero-node-output">
          <span className="landing-hero-node-icon"><Layers3 size={18} /></span>
          <span className="landing-hero-node-copy">
            <strong>Content studio</strong>
            <small>Strategy-driven assets out</small>
          </span>
          <ArrowDownRight size={17} className="landing-hero-node-arrow" />
        </div>

        <div className="landing-hero-visual-caption">
          <span className="landing-hero-caption-mark"><Workflow size={14} /></span>
          <span><strong>One connected system</strong><small>Research · Review · Strategy · Create</small></span>
        </div>
        </div>
      )}

      {!stillUnavailable && (
        <img
          key={stillSrc}
          className={'landing-hero-still' + (videoReady || showMotionFallback ? ' is-hidden' : '')}
          src={stillSrc}
          alt=""
          aria-hidden="true"
          draggable={false}
          onError={() => { setStillUnavailable(true); setShowMotionFallback(true); }}
        />
      )}

      {!videoUnavailable && (
        <>
          {renderVideoDeck(0)}
          {renderVideoDeck(1)}
        </>
      )}

      <div className="landing-hero-visual-topline" aria-hidden="true">
        <span className="landing-hero-visual-pulse" />
        <span>BRAND INTELLIGENCE ENGINE</span>
        <span className="landing-hero-visual-version">UT / OS</span>
      </div>
      <div className="landing-hero-visual-bottomline" aria-hidden="true">
        <span className="landing-hero-visual-bars"><i /><i /><i /><i /><i /><i /><i /></span>
        <span>{isDark ? 'DARK SYSTEM' : 'LIGHT SYSTEM'}</span>
        <span className="landing-hero-visual-bottom-status">{videoReady ? 'ANIMATION READY' : 'LIVE WORKFLOW'}</span>
      </div>
    </div>
  );
}
