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
  const [stillReady, setStillReady] = useState(false);
  const [videoUnavailable, setVideoUnavailable] = useState(false);
  const [stillUnavailable, setStillUnavailable] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    setTheme(readTheme());

    const observer = new MutationObserver(() => setTheme(readTheme()));
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReducedMotion(motionQuery.matches);
    updateMotion();
    motionQuery.addEventListener('change', updateMotion);

    return () => {
      observer.disconnect();
      motionQuery.removeEventListener('change', updateMotion);
    };
  }, []);

  const isDark = theme === 'dark';
  const stillSrc = isDark ? '/assets/hero/dark-still.webp' : '/assets/hero/light-still.webp';
  const webmSrc = isDark ? '/assets/hero/dark-video.webm' : '/assets/hero/light-video.webm';
  const mp4Src = isDark ? '/assets/hero/dark-video.mp4' : '/assets/hero/light-video.mp4';

  useEffect(() => {
    setVideoReady(false);
    setStillReady(false);
    setVideoUnavailable(false);
    setStillUnavailable(false);

    const video = videoRef.current;
    if (!video || reducedMotion) return;

    video.load();
    const playback = video.play();
    playback?.catch(() => {
      // Autoplay can be blocked by browser policy. The transparent still stays visible.
    });
  }, [webmSrc, mp4Src, reducedMotion]);

  return (
    <div
      className={'landing-hero-visual ' + (isDark ? 'is-dark' : 'is-light') + (stillReady || videoReady ? ' has-media' : '')}
      role="img"
      aria-label="UpTrendifyOS visual: public website research flows into the Brand Brain and then into marketing content."
    >
      <div className="landing-hero-visual-halo landing-hero-visual-halo-one" aria-hidden="true" />
      <div className="landing-hero-visual-halo landing-hero-visual-halo-two" aria-hidden="true" />

      {stillUnavailable && (!videoReady || reducedMotion) && (
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
          className={'landing-hero-still' + (videoReady && !reducedMotion ? ' is-hidden' : '')}
          src={stillSrc}
          alt=""
          aria-hidden="true"
          draggable={false}
          onLoad={() => setStillReady(true)}
          onError={() => { setStillReady(false); setStillUnavailable(true); }}
        />
      )}

      {!reducedMotion && !videoUnavailable && (
        <video
          key={webmSrc + '|' + mp4Src}
          ref={videoRef}
          className={'landing-hero-video' + (videoReady ? ' is-ready' : '')}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          aria-hidden="true"
          tabIndex={-1}
          onLoadedData={() => setVideoReady(true)}
          onError={() => setVideoUnavailable(true)}
        >
          <source src={webmSrc} type="video/webm" />
          <source src={mp4Src} type="video/mp4" />
        </video>
      )}

      <div className="landing-hero-visual-topline" aria-hidden="true">
        <span className="landing-hero-visual-pulse" />
        <span>RESEARCH · STRATEGY · CONTENT</span>
        <span className="landing-hero-visual-version">UT / OS</span>
      </div>
    </div>
  );
}
