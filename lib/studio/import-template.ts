import { CONTENT_DOC_MAX_BLOCKS, CONTENT_PAGE_SIZES, hashId, newBlockId, type ContentDocBlock, type ContentDocPage, type ContentPageSizeId } from '@/lib/content/document';

type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number };
type Bounds = { x: number; y: number; w: number; h: number };
type XmlNode = { tag: string; attrs: Record<string, string>; children: XmlNode[]; text: string };
type Style = Record<string, string>;
export type EmbeddedSvgImage = { blockId: string; dataUrl: string; fileName: string };
export type SvgTemplateImport = { page: ContentDocPage; warnings: string[]; embeddedImages: EmbeddedSvgImage[]; detectedElements: number };

const ID: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const MAX_FILE = 5 * 1024 * 1024;
const MAX_PATH = 50_000;
const IMAGE_PLACEHOLDER = 'https://example.invalid/studio-import-image-pending';

function decode(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity: string) => {
    const key = entity.toLowerCase();
    if (key === 'amp') return '&'; if (key === 'lt') return '<'; if (key === 'gt') return '>';
    if (key === 'quot') return '"'; if (key === 'apos') return "'";
    const n = key.startsWith('#x') ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
    try { return Number.isFinite(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : match; } catch { return match; }
  });
}

function parseXml(markup: string): XmlNode | null {
  if (!markup || markup.length > MAX_FILE || /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(markup)) return null;
  const root: XmlNode = { tag: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  const appendText = (value: string) => { stack[stack.length - 1]!.text += decode(value); };
  const endTag = (start: number) => {
    let quote = '';
    for (let i = start; i < markup.length; i++) {
      const c = markup[i]!;
      if (quote) { if (c === quote) quote = ''; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === '>') return i;
    }
    return -1;
  };
  let i = 0;
  while (i < markup.length) {
    const at = markup.indexOf('<', i);
    if (at < 0) { appendText(markup.slice(i)); break; }
    if (at > i) appendText(markup.slice(i, at));
    if (markup.startsWith('<!--', at)) { const e = markup.indexOf('-->', at + 4); if (e < 0) return null; i = e + 3; continue; }
    if (markup.startsWith('<![CDATA[', at)) { const e = markup.indexOf(']]>', at + 9); if (e < 0) return null; appendText(markup.slice(at + 9, e)); i = e + 3; continue; }
    if (markup.startsWith('<?', at)) { const e = markup.indexOf('?>', at + 2); if (e < 0) return null; i = e + 2; continue; }
    const end = endTag(at + 1);
    if (end < 0) return null;
    const raw = markup.slice(at + 1, end).trim();
    if (raw.startsWith('!')) { i = end + 1; continue; }
    if (raw.startsWith('/')) {
      const name = raw.slice(1).trim().split(/\s/)[0]?.toLowerCase();
      if (!name || stack.length < 2) return null;
      let matched = false;
      while (stack.length > 1) { if (stack.pop()!.tag === name) { matched = true; break; } }
      if (!matched) return null;
      i = end + 1; continue;
    }
    const selfClosing = /\/\s*$/.test(raw);
    const inner = raw.replace(/\/\s*$/, '');
    const name = /^([a-zA-Z_][\w:.-]*)/.exec(inner)?.[1];
    if (!name) return null;
    const attrs: Record<string, string> = {};
    const re = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+))/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(inner.slice(name.length))) !== null) attrs[m[1]!] = decode(m[2] ?? m[3] ?? m[4] ?? '');
    const node: XmlNode = { tag: name.toLowerCase(), attrs, children: [], text: '' };
    stack[stack.length - 1]!.children.push(node);
    if (!selfClosing) stack.push(node);
    i = end + 1;
  }
  return stack.length === 1 ? root : null;
}
function find(node: XmlNode, tag: string): XmlNode | null {
  if (node.tag === tag) return node;
  for (const child of node.children) { const found = find(child, tag); if (found) return found; }
  return null;
}
function textOf(node: XmlNode): string { return node.text + node.children.map(textOf).join(''); }
function attr(node: XmlNode, name: string, fallback = ''): string { return node.attrs[name] ?? fallback; }
function num(value: string, fallback = 0): number { const n = Number.parseFloat(value); return Number.isFinite(n) ? n : fallback; }
function dims(value: string, fallback: number): number {
  const m = /^\s*(-?(?:\d+\.?\d*|\.\d+))(px|pt|pc|mm|cm|in)?\s*$/i.exec(value);
  if (!m) return fallback;
  const n = Number(m[1]), u = (m[2] ?? 'px').toLowerCase();
  const f = u === 'pt' ? 96 / 72 : u === 'pc' ? 16 : u === 'mm' ? 96 / 25.4 : u === 'cm' ? 96 / 2.54 : u === 'in' ? 96 : 1;
  return n * f > 0 && Number.isFinite(n * f) ? n * f : fallback;
}
function mul(a: Matrix, b: Matrix): Matrix {
  return { a: a.a*b.a+a.c*b.b, b: a.b*b.a+a.d*b.b, c: a.a*b.c+a.c*b.d, d: a.b*b.c+a.d*b.d, e: a.a*b.e+a.c*b.f+a.e, f: a.b*b.e+a.d*b.f+a.f };
}
function point(m: Matrix, x: number, y: number) { return { x: m.a*x+m.c*y+m.e, y: m.b*x+m.d*y+m.f }; }
function transform(value: string): Matrix {
  let out = { ...ID };
  const re = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value))) {
    const v = m[2]!.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (v.some((x) => !Number.isFinite(x))) continue;
    const name = m[1]!.toLowerCase();
    let next: Matrix = { ...ID };
    if (name === 'matrix' && v.length >= 6) next = { a:v[0]!, b:v[1]!, c:v[2]!, d:v[3]!, e:v[4]!, f:v[5]! };
    else if (name === 'translate' && v.length) { next.e=v[0]!; next.f=v[1] ?? 0; }
    else if (name === 'scale' && v.length) { next.a=v[0]!; next.d=v[1] ?? v[0]!; }
    else if (name === 'rotate' && v.length) {
      const r=v[0]!*Math.PI/180, rot: Matrix={a:Math.cos(r),b:Math.sin(r),c:-Math.sin(r),d:Math.cos(r),e:0,f:0};
      next = v.length >= 3 ? mul(mul({ ...ID, e:v[1]!, f:v[2]! },rot),{ ...ID, e:-v[1]!, f:-v[2]! }) : rot;
    } else if (name === 'skewx' && v.length) next.c=Math.tan(v[0]!*Math.PI/180);
    else if (name === 'skewy' && v.length) next.b=Math.tan(v[0]!*Math.PI/180);
    out = mul(out,next);
  }
  return out;
}
function ownStyle(node: XmlNode, css: Map<string, Style>): Style {
  const out: Style = {}, id=attr(node,'id'), classes=attr(node,'class').split(/\s+/).filter(Boolean);
  for (const key of [node.tag, ...(id ? ['#'+id] : []), ...classes.map((c)=>'.'+c)]) Object.assign(out,css.get(key)??{});
  for (const key of ['fill','stroke','stroke-width','fill-opacity','stroke-opacity','opacity','color','font-family','font-size','font-weight','font-style','text-anchor','display','visibility']) if (node.attrs[key]!==undefined) out[key]=node.attrs[key]!;
  for (const rule of attr(node,'style').split(';')) { const i=rule.indexOf(':'); if(i>0) out[rule.slice(0,i).trim().toLowerCase()]=rule.slice(i+1).trim(); }
  return out;
}
function cssRules(root: XmlNode): Map<string,Style> {
  const result=new Map<string,Style>();
  const visit=(n:XmlNode)=>{ if(n.tag==='style'){
    const re=/([^{}]+)\{([^{}]*)\}/g; let m:RegExpExecArray|null;
    while((m=re.exec(textOf(n)))){
      const s:Style={}; for(const rule of m[2]!.split(';')){const i=rule.indexOf(':');if(i>0)s[rule.slice(0,i).trim().toLowerCase()]=rule.slice(i+1).trim();}
      for(const selector of m[1]!.split(',')){const key=selector.trim().split(/\s+/).pop();if(key&&(/^\.[\w-]+$/.test(key)||/^#[\w-]+$/.test(key)||/^[a-z][\w:-]*$/i.test(key)))result.set(key,{...(result.get(key)??{}),...s});}
    }
  } n.children.forEach(visit); }; visit(root); return result;
}
function color(value:string, fallback:string|null=null):string|null {
  const v=value.trim().toLowerCase(); if(!v||v==='none'||v==='transparent')return null;
  const short=/^#([0-9a-f]{3})$/i.exec(v); if(short)return '#'+short[1]!.split('').map(c=>c+c).join('');
  const full=/^#([0-9a-f]{6})$/i.exec(v);if(full)return '#'+full[1]!.toLowerCase();
  const rgb=/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+)?\s*\)$/.exec(v);
  if(rgb)return '#'+rgb.slice(1,4).map(p=>Math.max(0,Math.min(255,Number(p))).toString(16).padStart(2,'0')).join('');
  const named:Record<string,string>={black:'#000000',white:'#ffffff',red:'#ff0000',blue:'#0000ff',green:'#008000',yellow:'#ffff00',orange:'#ffa500',purple:'#800080',pink:'#ffc0cb',gray:'#808080',grey:'#808080',navy:'#000080',teal:'#008080',lime:'#00ff00',maroon:'#800000',gold:'#ffd700',coral:'#ff7f50'};
  return named[v]??fallback;
}
function fontSize(value:string,fallback:number):number {
  const m=/^\s*(-?(?:\d+\.?\d*|\.\d+))(px|pt|em|rem|%)?\s*$/i.exec(value);if(!m)return fallback;
  const n=Number(m[1]),u=(m[2]??'px').toLowerCase(),v=u==='pt'?n*96/72:u==='em'||u==='rem'?n*16:u==='%'?n*.16:n;
  return Number.isFinite(v)&&v>0?Math.max(8,Math.min(160,v)):fallback;
}
function pathBounds(d:string):Bounds|null {
  const t=d.match(/[a-zA-Z]|[-+]?(?:(?:\d+\.?\d*)|(?:\.\d+))(?:[eE][-+]?\d+)?/g)??[];
  let i=0,cmd='',x=0,y=0,sx=0,sy=0;const pts:Array<{x:number;y:number}>=[];
  const add=(a:number,b:number)=>{if(Number.isFinite(a)&&Number.isFinite(b))pts.push({x:a,y:b});};
  const isCmd=(v:string|undefined)=>Boolean(v&&/^[a-zA-Z]$/.test(v)), read=()=>Number(t[i++]), numbers=()=>i<t.length&&!isCmd(t[i]);
  while(i<t.length){if(isCmd(t[i]))cmd=t[i++]!;if(!cmd)return null;const u=cmd.toUpperCase(),rel=cmd!==u;
    if(u==='Z'){x=sx;y=sy;add(x,y);cmd='';continue;} if(!numbers()){cmd='';continue;}
    if(u==='H'){const a=read();x=rel?x+a:a;add(x,y);}
    else if(u==='V'){const a=read();y=rel?y+a:a;add(x,y);}
    else if(['M','L','T'].includes(u)){const a=read(),b=read();x=rel?x+a:a;y=rel?y+b:b;if(u==='M'){sx=x;sy=y;cmd=rel?'l':'L';}add(x,y);}
    else if(u==='C'){const v=[read(),read(),read(),read(),read(),read()].map((a,n)=>rel?a+(n%2?y:x):a);add(v[0]!,v[1]!);add(v[2]!,v[3]!);x=v[4]!;y=v[5]!;add(x,y);}
    else if(u==='S'||u==='Q'){const v=[read(),read(),read(),read()].map((a,n)=>rel?a+(n%2?y:x):a);add(v[0]!,v[1]!);x=v[2]!;y=v[3]!;add(x,y);}
    else if(u==='A'){const rx=Math.abs(read()),ry=Math.abs(read());read();read();read();const a=read(),b=read(),nx=rel?x+a:a,ny=rel?y+b:b;add(x-rx,y-ry);add(x+rx,y+ry);add(nx-rx,ny-ry);add(nx+rx,ny+ry);x=nx;y=ny;add(x,y);}
    else return null;
  }
  if(!pts.length)return null;const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  return {x:minX,y:minY,w:Math.max(.01,maxX-minX),h:Math.max(.01,maxY-minY)};
}
function transformBounds(b:Bounds,m:Matrix,p=0):Bounds {
  const points=[point(m,b.x-p,b.y-p),point(m,b.x+b.w+p,b.y-p),point(m,b.x-p,b.y+b.h+p),point(m,b.x+b.w+p,b.y+b.h+p)];
  const xs=points.map(v=>v.x),ys=points.map(v=>v.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  return {x:minX,y:minY,w:Math.max(.01,maxX-minX),h:Math.max(.01,maxY-minY)};
}
function rootBounds(root:XmlNode):Bounds {
  const v=attr(root,'viewBox').trim().split(/[\s,]+/).map(Number);
  if(v.length===4&&v.every(Number.isFinite)&&v[2]!>0&&v[3]!>0)return {x:v[0]!,y:v[1]!,w:v[2]!,h:v[3]!};
  return {x:0,y:0,w:dims(attr(root,'width'),800),h:dims(attr(root,'height'),800)};
}
function chooseSize(ratio:number):ContentPageSizeId {
  const values=Object.entries(CONTENT_PAGE_SIZES) as Array<[ContentPageSizeId,{width:number;height:number}]>;
  return values.reduce((best,cur)=>Math.abs(Math.log(cur[1].width/cur[1].height/ratio))<Math.abs(Math.log(best[1].width/best[1].height/ratio))?cur:best)[0];
}
function geometryFor(node:XmlNode, d:string, fs:number):Bounds|null {
  const n=(k:string,f=0)=>num(attr(node,k),f);
  if(node.tag==='path')return pathBounds(d);
  if(node.tag==='rect')return {x:n('x'),y:n('y'),w:Math.max(.01,n('width')),h:Math.max(.01,n('height'))};
  if(node.tag==='circle'){const x=n('cx'),y=n('cy'),r=Math.max(.01,n('r'));return{x:x-r,y:y-r,w:r*2,h:r*2};}
  if(node.tag==='ellipse'){const x=n('cx'),y=n('cy'),rx=Math.max(.01,n('rx')),ry=Math.max(.01,n('ry'));return{x:x-rx,y:y-ry,w:rx*2,h:ry*2};}
  if(node.tag==='line'){const x=n('x1'),y=n('y1'),x2=n('x2'),y2=n('y2');return{x:Math.min(x,x2),y:Math.min(y,y2),w:Math.max(.01,Math.abs(x2-x)),h:Math.max(.01,Math.abs(y2-y))};}
  if(node.tag==='polygon'||node.tag==='polyline'){const a=attr(node,'points').trim().split(/[\s,]+/).map(Number);if(a.length<4||a.some(v=>!Number.isFinite(v)))return null;const xs=a.filter((_,i)=>i%2===0),ys=a.filter((_,i)=>i%2===1);return{x:Math.min(...xs),y:Math.min(...ys),w:Math.max(.01,Math.max(...xs)-Math.min(...xs)),h:Math.max(.01,Math.max(...ys)-Math.min(...ys))};}
  if(node.tag==='text'){const txt=textOf(node).trim();if(!txt)return null;const lines=txt.split(/\r?\n/),w=Math.max(fs*.65,...lines.map(x=>x.length*fs*.58)),h=Math.max(fs*1.25,lines.length*fs*1.35),anchor=attr(node,'text-anchor','start'),x=n('x')-(anchor==='middle'?w/2:anchor==='end'?w:0);return{x,y:n('y')-fs*1.08,w,h};}
  if(node.tag==='image')return{x:n('x'),y:n('y'),w:Math.max(.01,n('width')),h:Math.max(.01,n('height'))};
  return null;
}
function pathFor(node:XmlNode):string|null {
  const n=(k:string,f=0)=>num(attr(node,k),f);
  if(node.tag==='path'){const d=attr(node,'d').trim();return d&&d.length<=MAX_PATH?d:null;}
  if(node.tag==='rect'){const x=n('x'),y=n('y'),w=n('width'),h=n('height');return w>0&&h>0?'M '+x+' '+y+' H '+(x+w)+' V '+(y+h)+' H '+x+' Z':null;}
  if(node.tag==='circle'||node.tag==='ellipse'){const cx=n('cx'),cy=n('cy'),rx=node.tag==='circle'?n('r'):n('rx'),ry=node.tag==='circle'?n('r'):n('ry');return rx>0&&ry>0?'M '+(cx-rx)+' '+cy+' A '+rx+' '+ry+' 0 1 0 '+(cx+rx)+' '+cy+' A '+rx+' '+ry+' 0 1 0 '+(cx-rx)+' '+cy+' Z':null;}
  if(node.tag==='line')return 'M '+n('x1')+' '+n('y1')+' L '+n('x2')+' '+n('y2');
  if(node.tag==='polygon'||node.tag==='polyline'){const a=attr(node,'points').trim().split(/[\s,]+/).map(Number);if(a.length<4||a.some(v=>!Number.isFinite(v)))return null;let d='M '+a[0]+' '+a[1];for(let i=2;i+1<a.length;i+=2)d+=' L '+a[i]+' '+a[i+1];return node.tag==='polygon'?d+' Z':d;}
  return null;
}
function httpUrl(value:string):boolean{try{const u=new URL(value);return u.protocol==='http:'||u.protocol==='https:';}catch{return false;}}
function svgColor(style:Style,key:string,fallback:string|null):string|null{const v=style[key]??(key==='fill'?'black':'none');return color(v==='currentColor'?(style.color??'#000000'):v,fallback);}
function warn(list:string[],message:string){if(list.length<8&&!list.includes(message))list.push(message);}

/** Parses editable text, raster images and vector shapes from Canva SVG exports. */
export function importSvgTemplate(markup:string):SvgTemplateImport|null {
  const tree=parseXml(markup);if(!tree)return null;const root=find(tree,'svg');if(!root)return null;
  const source=rootBounds(root),size=chooseSize(source.w/source.h),target=CONTENT_PAGE_SIZES[size],scale=Math.min(target.width/source.w,target.height/source.h);
  const px=(target.width-source.w*scale)/2,py=(target.height-source.h*scale)/2,css=cssRules(root);
  const warnings:string[]=[],embeddedImages:EmbeddedSvgImage[]=[],blocks:ContentDocBlock[]=[],unsupported=new Set<string>();
  const baseStyle:Style={fill:'black',stroke:'none','stroke-width':'1','font-size':'16px','font-family':'Arial','font-weight':'400','font-style':'normal','text-anchor':'start',color:'#000000'};
  const toGeo=(b:Bounds):Bounds=>({x:Math.max(-2000,Math.min(4000,Math.round(px+(b.x-source.x)*scale))),y:Math.max(-2000,Math.min(4000,Math.round(py+(b.y-source.y)*scale))),w:Math.max(24,Math.min(4000,Math.round(b.w*scale))),h:Math.max(24,Math.min(4000,Math.round(b.h*scale)))});
  const idFor=(n:XmlNode,i:number)=>'svg-'+hashId(i+'|'+n.tag+'|'+attr(n,'id')+'|'+n.text)+'-'+i;
  const walk=(node:XmlNode,parentStyle:Style,parentMatrix:Matrix,parentOpacity:number)=>{
    if(blocks.length>=CONTENT_DOC_MAX_BLOCKS){warn(warnings,'Only the first 40 supported objects were imported; Studio currently limits each page to 40 elements.');return;}
    if(['defs','clippath','mask','filter','metadata','title','desc','style','lineargradient','radialgradient','pattern','symbol'].includes(node.tag))return;
    if(['script','foreignobject','iframe','object','embed'].includes(node.tag)){warn(warnings,'Skipped unsafe or unsupported SVG element: <'+node.tag+'>.');return;}
    const own=ownStyle(node,css),st={...parentStyle,...own},opacity=Math.max(0,Math.min(1,parentOpacity*num(own.opacity??'1',1))),matrix=mul(parentMatrix,transform(attr(node,'transform')));
    if(['svg','g','a'].includes(node.tag)){node.children.forEach(c=>walk(c,st,matrix,opacity));return;}
    const id=idFor(node,blocks.length);
    if(node.tag==='image'){
      const href=attr(node,'href',attr(node,'xlink:href')).trim(),local=geometryFor(node,'',16);if(!local){warn(warnings,'Skipped image with invalid geometry.');return;}
      const geometry=toGeo(transformBounds(local,matrix)),alt=attr(node,'aria-label',attr(node,'id','Imported template image'));
      if(href.startsWith('data:')){const m=/^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=\s]+)$/i.exec(href);if(!m){warn(warnings,'Skipped embedded image that is not supported PNG/JPG/WEBP.');return;}const bytes=Math.floor(m[2]!.replace(/\s/g,'').length*3/4);if(bytes<=0||bytes>2*1024*1024){warn(warnings,'Skipped an embedded image larger than 2 MB.');return;}blocks.push({id,type:'image',url:IMAGE_PLACEHOLDER,alt,align:'left',width:100,geometry,opacity});embeddedImages.push({blockId:id,dataUrl:href,fileName:'imported-'+blocks.length+'.'+(m[1].endsWith('jpeg')?'jpg':m[1].slice(6))});return;}
      if(!httpUrl(href)){warn(warnings,'Skipped an image without an HTTP(S) URL or supported embedded raster data.');return;}
      blocks.push({id,type:'image',url:href,alt,align:'left',width:100,geometry,opacity});
      if(Math.abs(matrix.b)>.001||Math.abs(matrix.c)>.001)warn(warnings,'Rotation/skew on imported images is reduced to an editable bounding box.');
      return;
    }
    if(node.tag==='text'){
      const value=textOf(node).replace(/[\t\r]+/g,' ').trim();if(!value)return;
      const fs=fontSize(st['font-size']??'16px',16),local=geometryFor(node,'',fs);if(!local)return;
      const geometry=toGeo(transformBounds(local,matrix)),fill=svgColor(st,'fill','#000000'),family=(st['font-family']??'Arial').replace(/[";]/g,'').slice(0,120),weight=st['font-weight']??'400',style=st['font-style']??'normal',align=(st['text-anchor']==='middle'?'center':st['text-anchor']==='end'?'right':'left') as 'left'|'center'|'right';
      const common={id,text:value.slice(0,12000),align,color:fill,bg:null,bold:weight==='bold'||num(weight)>=600,italic:style==='italic'||style==='oblique',underline:false,fontFamily:family,fontSize:Math.max(8,Math.min(160,Math.round(fs*scale))),geometry,opacity};
      const block:ContentDocBlock=fs*scale>=30?{...common,type:'heading',level:fs*scale>=46?1:fs*scale>=36?2:3}:{...common,type:'text',size:fs*scale>=22?'lg':'md'};
      blocks.push(block);if(Math.abs(matrix.b)>.001||Math.abs(matrix.c)>.001)warn(warnings,'Rotated/skewed text remains editable but its original rotation is reduced to a bounding box.');return;
    }
    if(['path','rect','circle','ellipse','line','polygon','polyline'].includes(node.tag)){
      const d=pathFor(node);if(!d||d.length>MAX_PATH){warn(warnings,'Skipped a vector path that could not be safely interpreted.');return;}
      const local=geometryFor(node,d,16)??pathBounds(d);if(!local){warn(warnings,'Skipped a vector path with invalid geometry.');return;}
      const stroke=svgColor(st,'stroke',null),sw=Math.max(0,Math.min(1000,num(st['stroke-width']??'1'))),bounds=transformBounds(local,matrix,stroke?sw/2:0),geometry=toGeo(bounds),fillValue=st.fill??'black',fillNone=fillValue==='none'||fillValue==='transparent';
      let fill=svgColor(st,'fill','#000000');if(/^url\(/i.test(fillValue)){fill='#7c7cff';warn(warnings,'Gradient/pattern fills were simplified to solid colour; vector objects remain independently editable.');}
      if(!fillNone&&!fill)fill='#000000';if(fillNone&&!stroke)return;
      blocks.push({id,type:'shape',shape:'rectangle',color:fillNone?stroke:fill,align:'left',width:100,height:Math.max(24,Math.min(480,geometry.h)),geometry,opacity:opacity*num(st[fillNone?'stroke-opacity':'fill-opacity']??'1',1),svgPath:d,svgBounds:bounds,svgMatrix:matrix,svgFillNone:fillNone,svgStroke:stroke,svgStrokeWidth:sw} as ContentDocBlock);return;
    }
    if(!['tspan','use'].includes(node.tag))unsupported.add(node.tag);
    node.children.forEach(c=>walk(c,st,matrix,opacity));
  };
  root.children.forEach(node=>walk(node,baseStyle,mul(ID,transform(attr(root,'transform'))),1));
  for(const tag of [...unsupported].slice(0,4))warn(warnings,'Some <'+tag+'> elements were not imported as separate layers.');
  if(!blocks.length)return null;
  if(blocks.some(b=>b.type==='shape'&&b.svgPath))warn(warnings,'Text outlined by the source app is a vector shape; live text is editable when the SVG contains <text> elements.');
  return {page:{id:newBlockId('page'),size,blocks} as ContentDocPage,warnings,embeddedImages,detectedElements:blocks.length};
}
