import { ArrowUpRight, Bot, FileText, Globe2, Plus, Search, Sparkles, Users } from 'lucide-react';

const brands = [
  { name: 'Acme Technologies', type: 'B2B SaaS', health: 91, opportunities: 14, status: 'Research complete' },
  { name: 'Nova Health', type: 'Healthcare', health: 78, opportunities: 9, status: 'Needs review' },
  { name: 'Orbit Commerce', type: 'E-commerce', health: 84, opportunities: 21, status: 'Strategy ready' },
];

export default function Home() {
  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand-mark"><span className="logo" /> UpTrendifyOS</div>
        <nav className="nav">
          {['Dashboard', 'Clients', 'Brands', 'Strategy', 'Content Studio', 'Campaigns', 'Approvals', 'AI Command Center', 'Settings'].map((item, i) => (
            <a className={`nav-item ${i === 0 ? 'active' : ''}`} href="#" key={item}>{item}</a>
          ))}
        </nav>
        <div className="card" style={{ marginTop: 28 }}>
          <div className="eyebrow">AI COMMAND</div>
          <p style={{ marginBottom: 8 }}>Ask UpTrendifyOS to find your next growth opportunity.</p>
          <div className="badge"><Sparkles size={13} /> Agent ready</div>
        </div>
      </aside>

      <section className="main">
        <div className="topbar">
          <div>
            <div className="eyebrow">Agency command center</div>
            <h1>Good morning, growth team.</h1>
            <p className="subtitle">One operating system for research, brand intelligence, strategy, content and campaign execution across every client brand.</p>
          </div>
          <a className="badge" href="#brands"><Plus size={14} /> Add brand</a>
        </div>

        <div className="grid grid-4">
          {[
            ['Active brands', '12', Users],
            ['Campaigns', '27', Sparkles],
            ['Content to review', '18', FileText],
            ['Research jobs', '06', Globe2],
          ].map(([label, value, Icon]) => {
            const I = Icon as typeof Bot;
            return <div className="card metric" key={String(label)}><div className="metric-label"><I size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />{label}</div><div className="metric-value">{value}</div></div>;
          })}
        </div>

        <div className="grid grid-3" style={{ marginTop: 16 }}>
          <div className="card" style={{ gridColumn: 'span 2' }}>
            <div className="section-title"><div><div className="eyebrow">Portfolio</div><h2 style={{ margin: '5px 0' }}>Brand health</h2></div><Search size={18} color="var(--muted)" /></div>
            <div className="grid" id="brands">
              {brands.map((brand) => <div className="card brand-card" key={brand.name} style={{ background: '#0b111c' }}>
                <div style={{ display:'flex', justifyContent:'space-between', gap:14 }}>
                  <div><h3 style={{ margin:0 }}>{brand.name}</h3><div className="metric-label">{brand.type}</div></div>
                  <span className="badge">{brand.status}</span>
                </div>
                <div style={{ marginTop:16, display:'flex', justifyContent:'space-between' }}><span className="metric-label">Brand health</span><strong>{brand.health}/100</strong></div>
                <div className="progress" style={{ marginTop:8 }}><span style={{ width:`${brand.health}%` }} /></div>
                <div style={{ marginTop:12, display:'flex', justifyContent:'space-between', color:'var(--muted)', fontSize:13 }}><span>{brand.opportunities} growth opportunities</span><ArrowUpRight size={16} /></div>
              </div>)}
            </div>
          </div>

          <div className="card">
            <div className="eyebrow">Today</div>
            <h2>AI recommendations</h2>
            <div className="grid" style={{ marginTop:16 }}>
              {['14 content gaps detected for Acme','Nova needs Brand Brain approval','Orbit has 21 SEO opportunities'].map((text) => <div className="card" key={text} style={{ background:'#0b111c' }}><Sparkles size={16} color="var(--accent)"/><p style={{ margin:'8px 0 0' }}>{text}</p></div>)}
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop:16 }}>
          <div className="section-title"><div><div className="eyebrow">Golden workflow</div><h2 style={{ margin:'5px 0' }}>URL → Brand Brain → Growth Plan → Content</h2></div><a className="badge" href="#">Open workflow <ArrowUpRight size={13}/></a></div>
          <p className="subtitle">The first production workflow will onboard a brand from its public website, store evidence, generate an editable Brand Brain, then use that context for strategy and content.</p>
        </div>
      </section>
    </main>
  );
}
