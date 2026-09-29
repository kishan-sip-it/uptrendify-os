'use client';

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export function NetworkStatus() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);

    update();
    window.addEventListener('offline', update);
    window.addEventListener('online', update);

    return () => {
      window.removeEventListener('offline', update);
      window.removeEventListener('online', update);
    };
  }, []);

  if (!offline) return null;

  return (
    <>
      <div
        className="network-status"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
      >
        <span className="network-status-icon" aria-hidden="true">
          <WifiOff size={16} strokeWidth={2.2} />
        </span>
        <span className="network-status-copy">
          <strong>No internet connection</strong>
          <span>Your connection was lost. Changes and requests will resume when you are back online.</span>
        </span>
      </div>
      <style>{`
        .network-status {
          position: fixed;
          top: 14px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 3000;
          width: min(520px, calc(100vw - 28px));
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 11px 14px;
          border: 1px solid color-mix(in srgb, var(--danger) 42%, var(--border));
          border-left: 3px solid var(--danger);
          border-radius: 10px;
          background: var(--surface-elevated);
          color: var(--text);
          box-shadow: 0 14px 38px color-mix(in srgb, #000 28%, transparent);
          backdrop-filter: blur(14px);
          animation: network-status-in .16s ease-out both;
        }

        .network-status-icon {
          flex: 0 0 auto;
          width: 30px;
          height: 30px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 7px;
          color: var(--danger);
          background: color-mix(in srgb, var(--danger) 10%, var(--surface));
        }

        .network-status-copy {
          min-width: 0;
          display: grid;
          gap: 2px;
        }

        .network-status-copy strong {
          color: var(--text-strong);
          font-size: 13px;
          line-height: 1.3;
        }

        .network-status-copy span {
          color: var(--text-muted);
          font-size: 12px;
          line-height: 1.45;
        }

        @keyframes network-status-in {
          from { opacity: 0; transform: translate(-50%, -6px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }

        @media (max-width: 640px) {
          .network-status {
            top: 10px;
            width: calc(100vw - 20px);
            padding: 10px 12px;
          }
        }
      `}</style>
    </>
  );
}
