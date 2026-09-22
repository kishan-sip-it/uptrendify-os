import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CAN_VIEW_DASHBOARD, requireOrgRole } from '@/lib/auth/roles';
import { obs } from '@/lib/obs/logger';

const STAGES = [
  { key: 'research', label: 'Research', description: 'Discover what the business actually does.' },
  { key: 'brand_brain', label: 'Brand Intelligence', description: 'Review what AI discovered from the evidence.' },
  { key: 'strategy', label: 'Strategy', description: 'Turn verified intelligence into a marketing plan.' },
  { key: 'content', label: 'Content Studio', description: 'Create the assets you may actually publish.' },
  { key: 'campaigns', label: 'Campaigns', description: 'Organize content around marketing initiatives.' },
  { key: 'approval', label: 'Content Approval', description: 'Approve the exact content version.' },
  { key: 'publishing', label: 'Publishing', description: 'Send approved content to connected channels.' },
];

export async function GET() {
  try {
    const auth=await requireOrgRole(CAN_VIEW_DASHBOARD);
    if(auth.error) return NextResponse.json(auth.error.body,{status:auth.error.status});
    const supabase=await createSupabaseServerClient();

    const brandsResult=await supabase.from('brands').select('id,name,status').eq('organization_id',auth.context.organizationId).neq('status','ARCHIVED').order('created_at',{ascending:true}).limit(50);
    if(brandsResult.error) throw brandsResult.error;
    const brands=brandsResult.data??[];

    if(brands.length===0) return NextResponse.json({ok:true,stages:STAGES,currentKey:'research',nextAction:'Create your first brand',message:'Add a brand so the system can research it.'});

    const brandIds=brands.map((b)=>b.id);
    const [runs,suggestions,strategies,content,campaigns]=await Promise.all([
      supabase.from('research_runs').select('id,brand_id,status,created_at').in('brand_id',brandIds).order('created_at',{ascending:false}).limit(20),
      supabase.from('brand_suggestions').select('id,brand_id,field,status').in('brand_id',brandIds).order('created_at',{ascending:false}).limit(500),
      supabase.from('strategies').select('id,brand_id,status,created_at').in('brand_id',brandIds).order('created_at',{ascending:false}).limit(50),
      supabase.from('content_items').select('id,brand_id,status,created_at').in('brand_id',brandIds).order('created_at',{ascending:false}).limit(100),
      supabase.from('campaigns').select('id,brand_id,status,created_at').in('brand_id',brandIds).order('created_at',{ascending:false}).limit(100),
    ]);
    if(runs.error) throw runs.error;
    if(suggestions.error) throw suggestions.error;
    if(strategies.error) throw strategies.error;
    if(content.error) throw content.error;
    if(campaigns.error) throw campaigns.error;

    const runData=runs.data??[];
    const suggestionData=suggestions.data??[];
    const gateFields=new Set(suggestionData.filter((s)=>s.status==='APPROVED'||s.status==='EDITED').map((s)=>s.field));
    const gatePassed=gateFields.size>=4 && gateFields.has('brand_name');
    const researchDone=runData.some((r)=>r.status==='COMPLETED'||r.status==='PARTIAL');
    const researchActive=runData.some((r)=>r.status==='QUEUED'||r.status==='RUNNING');

    const latestStrategy=(strategies.data??[]).find((s)=>s.status==='SUCCEEDED');
    const contentRows=content.data??[];
    const campaignRows=campaigns.data??[];

    let currentKey='research';
    let nextAction='Start research';
    let blocker: string | null=null;
    let currentBrandId: string | null = null;

    if(researchActive){currentKey='research';nextAction='Let research finish';}
    else if(!researchDone){currentKey='research';nextAction='Start research';}
    else if(!gatePassed){currentKey='brand_brain';nextAction='Review Brand Intelligence';}
    else if(!latestStrategy){currentKey='strategy';nextAction='Generate strategy';}
    else if(contentRows.length===0){currentKey='content';nextAction='Create your first content';}
    else if(campaignRows.length===0){currentKey='campaigns';nextAction='Create a campaign';}
    else if(contentRows.some((c)=>['IN_REVIEW','CLIENT_REVIEW','APPROVED','READY_TO_PUBLISH'].includes(c.status))){currentKey=contentRows.some((c)=>c.status==='READY_TO_PUBLISH')?'publishing':'approval';nextAction=currentKey==='publishing'?'Publish approved content':'Review content awaiting approval';}
    else{currentKey='campaigns';nextAction='Review campaign performance and add content';}
    currentBrandId = brands[0]?.id ?? null;

    const index=STAGES.findIndex((s)=>s.key===currentKey);
    const nextHref = !currentBrandId ? '/brands/new' : currentKey==='research' ? '/brands/'+currentBrandId : currentKey==='brand_brain' ? '/brands/'+currentBrandId+'#intelligence' : currentKey==='strategy' ? '/brands/'+currentBrandId+'#strategy' : currentKey==='content' ? '/content' : currentKey==='campaigns' ? '/campaigns' : currentKey==='approval' ? '/approvals' : '/approvals?status=READY_TO_PUBLISH';
    const stageState=STAGES.map((stage,i)=>({
      ...stage,
      status:i<index?'COMPLETED':i===index?'CURRENT':'UPCOMING'
    }));

    return NextResponse.json({ok:true,stages:stageState,currentKey,currentBrandId,nextAction,nextHref,blocker,message:null,progressPercent:Math.round((Math.max(0,index)/STAGES.length)*100)});
  }catch(error){
    obs.error('Workflow state load failed',{error:error instanceof Error?error.message:String(error)});
    return NextResponse.json({error:'Could not load workflow state'},{status:500});
  }
}
