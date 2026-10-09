'use client';
import { ArrowRight } from 'lucide-react';
import { StageStepper, type StepperStage } from '@/components/ui/stage-stepper';
import { useEffect, useState } from 'react';
type Stage={key:string;label:string;description:string;status:'COMPLETED'|'CURRENT'|'UPCOMING'};
type Workflow={stages:Stage[];currentKey:string;nextAction:string;nextHref?:string;message?:string|null;blocker?:string|null;progressPercent?:number};
export function WorkflowProgress(){
 const [data,setData]=useState<Workflow|null>(null);
 useEffect(()=>{fetch('/api/workflow',{cache:'no-store'}).then(r=>r.json()).then(setData).catch(()=>undefined);},[]);
 if(!data)return <div className="card workflow-card"><span className="spinner"/></div>;
 return <section className="card workflow-card" id="workflow"><div className="section-title workflow-head"><div><div className="eyebrow">Your marketing workflow</div><h2>Know where you are. Know what comes next.</h2><p className="subtitle">Research → Brand Intelligence → Strategy → Content → Campaigns → Approval → Publishing.</p></div><span className="workflow-percent">{data.progressPercent??0}%</span></div><StageStepper className="workflow-track" label="Marketing workflow progress" stages={data.stages.map((stage): StepperStage => ({ key: stage.key, label: stage.label, state: stage.status === 'COMPLETED' ? 'done' : stage.status === 'CURRENT' ? 'active' : 'todo' }))} /><div className="workflow-next"><div><span className="metric-label">Current step</span><strong>{data.stages.find(s=>s.key===data.currentKey)?.label??'Workflow'}</strong><span className="activity-meta">{data.blocker||data.message||'Follow the highlighted next action.'}</span></div>{data.nextHref?<a className="badge auth-submit" href={data.nextHref}>{data.nextAction}<ArrowRight size={14}/></a>:<span className="badge">{data.nextAction}</span>}</div></section>;
}
