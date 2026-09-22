'use client';
import { useState } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
export default function InvitePage(){
 const router=useRouter(); const params=useSearchParams(); const token=params.get('token')||''; const [loading,setLoading]=useState(false); const [error,setError]=useState(''); const [done,setDone]=useState(false);
 async function accept(){setLoading(true);setError('');try{const r=await fetch('/api/team/invitations/accept',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token})});const b=await r.json().catch(()=>null);if(r.status===401){router.push('/login?next='+encodeURIComponent('/invite?token='+token));return;}if(!r.ok)throw new Error(b?.error||'Could not accept invitation');setDone(true);router.push('/dashboard');}catch(e){setError(e instanceof Error?e.message:'Could not accept invitation');}finally{setLoading(false);}}
 return <main className="auth-layout"><section className="auth-panel card"><div className="eyebrow">Workspace invitation</div><h1>{done?'You joined the workspace':'Join your team'}</h1><p className="subtitle">{done?'Your workspace membership is active.':token?'Accept this invitation with the same email address the invite was sent to.':'This invitation link is incomplete.'}</p>{error&&<p className="field-note" role="alert">{error}</p>}{done?<div className="badge"><Check size={14}/> Joined</div>:token?<button className="badge auth-submit" disabled={loading} onClick={accept}>{loading?<><LoaderCircle size={14} className="spin"/> Joining…</>:<>Accept invitation</>}</button>:null}</section></main>;
}
