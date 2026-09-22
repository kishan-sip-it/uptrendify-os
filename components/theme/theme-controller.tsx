'use client';
import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
export type ThemePreference = 'light' | 'dark' | 'system';
export function ThemeController() {
  const [theme, setTheme] = useState<ThemePreference>('light');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const stored = window.localStorage.getItem('uptrendify-theme') as ThemePreference | null;
    const initial = stored === 'dark' || stored === 'system' || stored === 'light' ? stored : 'light';
    setTheme(initial); document.documentElement.dataset.theme = initial; setReady(true);
    if (!stored) void fetch('/api/preferences',{cache:'no-store'}).then(async r=>{
      if(!r.ok)return; const b=await r.json().catch(()=>null); const t=b?.theme as ThemePreference|undefined;
      if(t==='light'||t==='dark'||t==='system'){setTheme(t);document.documentElement.dataset.theme=t;window.localStorage.setItem('uptrendify-theme',t);}
    }).catch(()=>undefined);
  },[]);
  async function change(next:ThemePreference){setTheme(next);document.documentElement.dataset.theme=next;window.localStorage.setItem('uptrendify-theme',next);await fetch('/api/preferences',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({theme:next})}).catch(()=>undefined);}
  if(!ready)return null;
  const opts=[['light','Light',Sun],['dark','Dark',Moon],['system','System',Monitor] ] as const;
  return <div className="theme-control" aria-label="Theme preference">{opts.map(([k,label,Icon])=><button key={k} type="button" className={'theme-option '+(theme===k?'active':'')} onClick={()=>change(k)} aria-pressed={theme===k}><Icon size={14}/> {label}</button>)}</div>;
}