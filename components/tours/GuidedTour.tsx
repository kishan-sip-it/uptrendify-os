'use client';
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
export type GuidedTourStep={title:string;body:string};
export function GuidedTour({stageKey,steps}:{stageKey:string;steps:GuidedTourStep[]}){
 const [open,setOpen]=useState(false),[index,setIndex]=useState(0);
 useEffect(()=>{fetch('/api/tours?stageKey='+encodeURIComponent(stageKey),{cache:'no-store'}).then(r=>r.json()).then(b=>setOpen(!b?.state)).catch(()=>undefined);},[stageKey]);
 if(!open||!steps[index])return null;
 async function close(status:'SKIPPED'|'COMPLETED'){setOpen(false);await fetch('/api/tours',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({stageKey,status})}).catch(()=>undefined);}
 return <div className="tour-center"><section className="tour-card" role="dialog" aria-label={'Guide step '+(index+1)+' of '+steps.length}><div className="eyebrow">Guide · {index+1}/{steps.length}</div><h3>{steps[index].title}</h3><p>{steps[index].body}</p><div className="tour-card-actions"><button type="button" className="tour-link" disabled={index===0} onClick={()=>setIndex(v=>Math.max(0,v-1))}><ArrowLeft size={14}/> Back</button><button type="button" className="tour-link skip" onClick={()=>close('SKIPPED')}>Skip</button>{index<steps.length-1?<button type="button" className="tour-primary" onClick={()=>setIndex(v=>v+1)}>Next <ArrowRight size={14}/></button>:<button type="button" className="tour-primary" onClick={()=>close('COMPLETED')}>Done</button>}</div></section></div>;
}