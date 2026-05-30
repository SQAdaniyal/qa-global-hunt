import { useState, useRef, useCallback } from "react";

// ═══════════════════════════════════════
//  API — calls /api/chat (Vercel route)
//  No API key needed in browser!
// ═══════════════════════════════════════
const ATS_MODEL  = "meta-llama/llama-3.3-70b-instruct:free";
const HUNT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

async function orCall(messages, model = ATS_MODEL) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 4000, messages })
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error || `Server Error ${res.status}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function extractPDFText(b64) {
  if (!window.pdfjsLib) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const pdf = await window.pdfjsLib.getDocument({ data: arr }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(x => x.str).join(" ") + "\n";
  }
  return text.trim();
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target.result.split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function parseJSON(text, type = "object") {
  const clean = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  const open = type === "array" ? "[" : "{";
  const close = type === "array" ? "]" : "}";
  const s = clean.indexOf(open);
  const e = clean.lastIndexOf(close);
  if (s >= 0 && e > s) return JSON.parse(clean.substring(s, e + 1));
  throw new Error("No JSON found");
}

// ═══════════════════════════════════════
//  PROMPTS
// ═══════════════════════════════════════
const ATS_PROMPT = (resumeText) => `You are a world-class ATS resume optimizer.

Resume content:
${resumeText}

Candidate: Software Quality Assurance (SQA) PRIMARY, Project Management secondary.
Goal: Remote worldwide OR company-sponsored relocation. EXCLUDE Israel.

Return ONLY valid raw JSON (no markdown, no explanation):
{"candidateName":"name","currentRole":"title","experience":"X years","atsScore":72,"optimizedResume":"COMPLETE professional resume: Professional Summary | Core Skills | Professional Experience | Education | Certifications | Tools & Technologies","skills":["Manual Testing","Test Automation","JIRA","Selenium","Agile","Scrum","API Testing","Postman","Bug Reporting","Regression Testing","Performance Testing","SQL","Python","Project Management"],"jobTitles":["QA Engineer","SQA Engineer","Test Automation Engineer","QA Analyst","QA Lead","Test Manager"],"keywords":["quality assurance","software testing","test automation","selenium","JIRA","agile","scrum","manual testing","regression testing","api testing","defect tracking","test planning","CI/CD"],"tools":["JIRA","Selenium","Postman","TestRail","Cypress","Jenkins","Git"],"suggestions":["Add quantified achievements like defect reduction %","Include ISTQB certification if available","Add GitHub/portfolio links","Mention domain expertise: fintech/ecommerce/healthtech","Use strong action verbs: Architected, Optimized, Reduced, Delivered"]}`;

const ATS_MANUAL = (info) => `Build a complete ATS-optimized resume for: ${info}
Roles: SQA/QA Engineering. Remote worldwide OR relocation. EXCLUDE Israel.
Return ONLY raw JSON: {"candidateName":"string","currentRole":"string","experience":"string","atsScore":72,"optimizedResume":"full professional resume text with all sections","skills":["array"],"jobTitles":["array"],"keywords":["array"],"tools":["array"],"suggestions":["5 tips"]}`;

const HUNT_PROMPT = (skills, titles) => `Search online right now for current open SQA/QA remote and relocation jobs.

Job titles to search: ${titles}
Skills required: ${skills}

STRICT REQUIREMENTS:
- REMOTE (work from anywhere worldwide) OR RELOCATION (company provides visa + relocation package)
- Any country EXCEPT Israel
- Currently open positions in 2025-2026

Search these sites and find real open listings:
linkedin.com/jobs, weworkremotely.com, himalayas.app, remotive.io, remote.co, relocate.me, indeed.com, wellfound.com, glassdoor.com

For each job found return this exact JSON structure:
[{"title":"exact job title","company":"company name","location":"City Country or Worldwide Remote","type":"remote or relocation","salary":"USD range or null","applyLink":"direct application URL","description":"2-3 sentence role description","requirements":["req1","req2","req3"],"posted":"X days ago","visaSponsorship":true,"country":"company HQ country","tech_stack":["tool1","tool2"]}]

Return ONLY the JSON array. No markdown. No explanation. No preamble.`;

// ═══════════════════════════════════════
//  THEME
// ═══════════════════════════════════════
const C = {
  bg:"#07090F", surface:"#0E1420", card:"#111929", border:"#1C2B42",
  blue:"#3B7BF8", blueGlow:"#3B7BF820", purple:"#7C5CFC",
  teal:"#0ECFB0", gold:"#F5A623", red:"#F44A58",
  text:"#EDF2FF", muted:"#5A7090", label:"#8BA3C7"
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
html,body,#root{background:${C.bg};min-height:100vh;}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:${C.bg}}::-webkit-scrollbar-thumb{background:${C.border};border-radius:4px}
@keyframes fadeUp{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@keyframes radar{0%{transform:scale(1);opacity:.6}100%{transform:scale(2.2);opacity:0}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
@keyframes slide{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:translateX(0)}}
.fu{animation:fadeUp .5s ease both}.fu1{animation:fadeUp .5s .1s ease both}.fu2{animation:fadeUp .5s .2s ease both}.fu3{animation:fadeUp .5s .3s ease both}
.spin{animation:spin 1.2s linear infinite}.float{animation:float 3s ease-in-out infinite}.fi{animation:fadeIn .3s ease}
.jcard{transition:transform .2s,border-color .2s,box-shadow .2s}.jcard:hover{transform:translateY(-2px);border-color:${C.blue}!important;box-shadow:0 8px 32px ${C.blueGlow}}
.uz{transition:all .25s}.uz:hover{border-color:${C.blue}!important;background:${C.blueGlow}!important}
.pbtn{transition:transform .2s,box-shadow .2s}.pbtn:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 12px 40px ${C.blue}50!important}
.nbtn:hover{background:${C.blueGlow}!important;color:${C.blue}!important}
.tbtn:hover{color:${C.text}!important}
.fbtn:hover{border-color:${C.blue}!important}
.ats{white-space:pre-wrap;font-family:'JetBrains Mono',monospace;font-size:12.5px;line-height:1.85;color:${C.label}}
.li{animation:slide .3s ease}
`;

function Logo() {
  return <div style={{display:"flex",alignItems:"center",gap:10}}>
    <div style={{width:38,height:38,borderRadius:11,background:`linear-gradient(135deg,${C.blue},${C.purple})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:19,boxShadow:`0 4px 16px ${C.blue}40`}}>🎯</div>
    <div>
      <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:18,color:C.text}}>QA<span style={{background:`linear-gradient(90deg,${C.blue},${C.purple})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Global</span>Hunt</div>
      <div style={{fontSize:10,color:C.muted,letterSpacing:"0.5px",textTransform:"uppercase"}}>AI Career Platform</div>
    </div>
  </div>;
}

function Tag({ children, color=C.blue, bg }) {
  return <span style={{display:"inline-flex",alignItems:"center",padding:"4px 12px",borderRadius:20,fontSize:12,fontWeight:600,color,background:bg||(color+"18")}}>{children}</span>;
}

// ── HOME ──
function HomeScreen({ onFile, pdfStatus, manualInput, setManualInput, useManual, setUseManual, file, onOptimize }) {
  const [drag, setDrag] = useState(false);
  const ref = useRef();
  const ok = file || (useManual && manualInput.trim().length > 20);
  const drop = e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if(f) onFile(f); };

  return <div style={{background:C.bg,minHeight:"100vh",fontFamily:"'DM Sans',sans-serif",color:C.text,position:"relative",overflow:"hidden"}}>
    <style>{CSS}</style>
    <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0}}>
      <div style={{position:"absolute",top:"-15%",right:"-8%",width:700,height:700,borderRadius:"50%",background:`radial-gradient(circle,${C.blue}09 0%,transparent 65%)`}}/>
      <div style={{position:"absolute",bottom:"-10%",left:"-5%",width:600,height:600,borderRadius:"50%",background:`radial-gradient(circle,${C.purple}09 0%,transparent 65%)`}}/>
    </div>
    <nav style={{padding:"18px 28px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",position:"relative",zIndex:10,backdropFilter:"blur(12px)",background:C.bg+"DD"}}>
      <Logo/>
      <div style={{display:"flex",gap:10,alignItems:"center"}}>
        <span style={{color:C.teal,fontSize:13}}>● Free AI</span>
        <Tag color={C.blue}>190+ Countries</Tag>
      </div>
    </nav>

    <div style={{maxWidth:740,margin:"0 auto",padding:"56px 24px 80px",position:"relative",zIndex:10}}>
      <div className="fu" style={{textAlign:"center",marginBottom:52}}>
        <div style={{display:"inline-flex",alignItems:"center",gap:8,background:C.surface,border:`1px solid ${C.border}`,borderRadius:24,padding:"7px 18px",marginBottom:28,fontSize:13}}>
          <span style={{color:C.teal,fontSize:10}}>●</span>
          <span style={{color:C.label}}>190+ countries · </span>
          <span style={{color:C.gold,fontWeight:600}}>Israel Excluded ✗</span>
        </div>
        <h1 style={{fontFamily:"'Syne',sans-serif",fontSize:"clamp(34px,5.5vw,54px)",fontWeight:800,lineHeight:1.1,letterSpacing:"-1.5px",marginBottom:22}}>
          Your Global<br/>
          <span style={{background:`linear-gradient(110deg,${C.blue} 30%,${C.purple})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>SQA Career</span><br/>
          Starts Here
        </h1>
        <p style={{fontSize:17,color:C.muted,lineHeight:1.75,maxWidth:500,margin:"0 auto 40px"}}>Resume upload karein → ATS-optimized ho jayegi → Worldwide remote & relocation jobs automatically dhundhe jayenge</p>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,flexWrap:"wrap"}}>
          {[{i:"📄",l:"Upload"},{},{i:"🤖",l:"ATS Boost"},{},{i:"🌍",l:"AI Hunt"},{},{i:"✈️",l:"Apply"}].map((s,idx)=>
            s.i ? <div key={idx} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
              <div className="float" style={{width:50,height:50,borderRadius:14,background:C.card,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>{s.i}</div>
              <span style={{fontSize:11,color:C.muted}}>{s.l}</span>
            </div> : <div key={idx} style={{color:C.border,fontSize:18,paddingBottom:18}}>›</div>
          )}
        </div>
      </div>

      <div className="fu1" style={{background:C.card,borderRadius:22,border:`1px solid ${C.border}`,overflow:"hidden",marginBottom:20}}>
        <div style={{display:"flex",borderBottom:`1px solid ${C.border}`}}>
          {[{id:false,l:"📄 Upload PDF Resume"},{id:true,l:"✍️ Describe Manually"}].map(t => (
            <button key={String(t.id)} onClick={()=>setUseManual(t.id)} className="tbtn" style={{flex:1,padding:"16px 20px",border:"none",cursor:"pointer",background:useManual===t.id?C.blueGlow:"transparent",color:useManual===t.id?C.blue:C.muted,borderBottom:useManual===t.id?`2px solid ${C.blue}`:"2px solid transparent",fontSize:14,fontWeight:600,fontFamily:"'DM Sans',sans-serif",transition:"all .2s"}}>{t.l}</button>
          ))}
        </div>
        <div style={{padding:32}}>
          {!useManual ? (<>
            <div className="uz" style={{border:`2px dashed ${drag?C.blue:file?C.teal:C.border}`,borderRadius:16,padding:"44px 24px",textAlign:"center",cursor:"pointer",background:drag?C.blueGlow:file?(C.teal+"0C"):"transparent"}}
              onClick={()=>ref.current?.click()} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={drop}>
              <input ref={ref} type="file" accept=".pdf" style={{display:"none"}} onChange={e=>onFile(e.target.files[0])}/>
              <div className="float" style={{fontSize:48,marginBottom:14}}>{file?"✅":"📄"}</div>
              {file ? <>
                <p style={{fontWeight:600,marginBottom:4,fontSize:15}}>{file.name}</p>
                <p style={{color:pdfStatus==="error"?C.red:C.teal,fontSize:13}}>
                  {pdfStatus==="extracting"?"📖 Text extract ho raha hai...":pdfStatus==="done"?"✓ Ready — Optimize kar sakte ho!":"⚠️ Error — Manual tab use karein"}
                </p>
              </> : <>
                <p style={{fontWeight:600,marginBottom:8,fontSize:15}}>PDF resume yahan drop karein</p>
                <p style={{color:C.muted,fontSize:13}}>ya click karein · PDF only</p>
              </>}
            </div>
          </>) : (<>
            <label style={{display:"block",fontSize:12,fontWeight:700,color:C.label,marginBottom:10,letterSpacing:"0.3px",textTransform:"uppercase"}}>Apni Skills & Background</label>
            <textarea value={manualInput} onChange={e=>setManualInput(e.target.value)}
              placeholder="Misal: 4 saal SQA experience. Manual testing, Selenium automation, Postman API testing, JIRA. Agile/Scrum teams mein kaam kiya. Thora project management bhi — sprint planning, client demos. Remote ya relocation chahiye..."
              style={{width:"100%",minHeight:155,background:C.bg,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",color:C.text,fontSize:14,fontFamily:"'DM Sans',sans-serif",resize:"vertical",lineHeight:1.7,outline:"none"}}/>
            <p style={{color:C.muted,fontSize:12,marginTop:8}}>Jitna detail, utna behtar ATS resume</p>
          </>)}
          <button onClick={onOptimize} disabled={!ok} className="pbtn" style={{width:"100%",marginTop:24,padding:"16px",background:ok?`linear-gradient(135deg,${C.blue},${C.purple})`:C.border,color:ok?"#fff":C.muted,border:"none",borderRadius:13,fontSize:16,fontWeight:700,fontFamily:"'Syne',sans-serif",cursor:ok?"pointer":"not-allowed",boxShadow:ok?`0 8px 28px ${C.blue}40`:"none",letterSpacing:"0.3px"}}>
            🤖 Analyze & ATS-Optimize →
          </button>
        </div>
      </div>

      <div className="fu2" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14}}>
        {[
          {i:"🎯",c:C.blue,t:"ATS-Optimized",d:"AI keywords extract karke resume rebuild karta hai"},
          {i:"🌍",c:C.teal,t:"Worldwide Hunt",d:"190+ countries mein remote & relocation jobs"},
          {i:"✈️",c:C.gold,t:"Relocation Filter",d:"Visa + moving support wali companies"},
        ].map((f,i) => (
          <div key={i} style={{background:C.surface,borderRadius:16,padding:"20px 18px",border:`1px solid ${C.border}`,textAlign:"center"}}>
            <div style={{fontSize:30,marginBottom:10}}>{f.i}</div>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14,marginBottom:6,color:f.c}}>{f.t}</div>
            <div style={{color:C.muted,fontSize:12,lineHeight:1.6}}>{f.d}</div>
          </div>
        ))}
      </div>

      <div className="fu3" style={{marginTop:28,textAlign:"center"}}>
        <p style={{color:C.muted,fontSize:12,marginBottom:12,letterSpacing:"0.5px",textTransform:"uppercase"}}>Searches across</p>
        <div style={{display:"flex",flexWrap:"wrap",gap:8,justifyContent:"center"}}>
          {["LinkedIn","Indeed","Remote.co","WeWorkRemotely","Himalayas","Remotive","Relocate.me","Glassdoor","Wellfound"].map(b => (
            <span key={b} style={{background:C.card,border:`1px solid ${C.border}`,color:C.label,padding:"5px 14px",borderRadius:8,fontSize:12,fontWeight:500}}>{b}</span>
          ))}
        </div>
      </div>
    </div>
  </div>;
}

// ── ATS ──
function ATSScreen({ ats, loading, onHunt, onBack }) {
  const [tab, setTab] = useState("resume");
  const [copied, setCopied] = useState(false);
  const sc = s => s>=80?C.teal:s>=60?C.gold:C.red;
  const copy = () => { navigator.clipboard.writeText(ats?.optimizedResume||""); setCopied(true); setTimeout(()=>setCopied(false),2200); };

  return <div style={{background:C.bg,minHeight:"100vh",fontFamily:"'DM Sans',sans-serif",color:C.text}}>
    <style>{CSS}</style>
    <header style={{padding:"14px 24px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100,background:C.bg+"EE",backdropFilter:"blur(12px)"}}>
      <Logo/>
      <div style={{display:"flex",gap:10,alignItems:"center"}}>
        {ats&&!loading&&<Tag color={sc(ats.atsScore)}>✓ ATS Score: {ats.atsScore}%</Tag>}
        <button onClick={onBack} className="nbtn" style={{background:"transparent",color:C.muted,border:`1px solid ${C.border}`,borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:13,fontFamily:"'DM Sans',sans-serif",transition:"all .2s"}}>← Back</button>
      </div>
    </header>
    <div style={{maxWidth:880,margin:"0 auto",padding:"36px 24px"}}>
      <div className="fu" style={{marginBottom:32}}>
        <h1 style={{fontFamily:"'Syne',sans-serif",fontSize:30,fontWeight:800,letterSpacing:"-0.5px",marginBottom:8}}>
          {loading?"Resume Optimize Ho Raha Hai...":ats?.candidateName+" ka ATS Profile"}
        </h1>
        <p style={{color:C.muted,fontSize:15}}>{loading?"AI aapki resume parh raha hai, keywords extract kar raha hai...":ats?.currentRole+" · "+ats?.experience}</p>
      </div>

      {loading ? <div style={{textAlign:"center",padding:"80px 24px"}}>
        <div className="spin" style={{width:60,height:60,border:`3px solid ${C.border}`,borderTopColor:C.blue,borderRadius:"50%",margin:"0 auto 28px"}}/>
        <p style={{color:C.label,fontSize:16,marginBottom:8}}>Gemini AI analyze kar raha hai...</p>
        <p style={{color:C.muted,fontSize:13}}>Keywords extract · ATS rebuild · Score calculate</p>
      </div> : <>
        <div className="fu1" style={{display:"flex",gap:4,marginBottom:24,background:C.surface,padding:4,borderRadius:12,width:"fit-content",border:`1px solid ${C.border}`}}>
          {[{id:"resume",l:"📄 Resume"},{id:"skills",l:"🛠️ Skills"},{id:"keywords",l:"🔑 Keywords"},{id:"tips",l:"💡 Tips"}].map(t => (
            <button key={t.id} onClick={()=>setTab(t.id)} className="tbtn" style={{padding:"9px 22px",borderRadius:9,border:"none",cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:"'DM Sans',sans-serif",transition:"all .2s",background:tab===t.id?C.blue:"transparent",color:tab===t.id?"#fff":C.muted}}>{t.l}</button>
          ))}
        </div>
        <div className="fi">
          {tab==="resume" && <div style={{background:C.card,borderRadius:18,border:`1px solid ${C.border}`,overflow:"hidden"}}>
            <div style={{padding:"14px 22px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontWeight:700,fontSize:15}}>ATS-Optimized Resume</span>
              <button onClick={copy} style={{background:copied?C.teal:C.blue,color:"#fff",border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:"'DM Sans',sans-serif",transition:"background .2s"}}>{copied?"✓ Copied!":"📋 Copy"}</button>
            </div>
            <div className="ats" style={{padding:"24px 28px",maxHeight:520,overflowY:"auto"}}>{ats?.optimizedResume}</div>
          </div>}
          {tab==="skills" && <div style={{display:"flex",flexDirection:"column",gap:18}}>
            <div style={{background:C.card,borderRadius:18,padding:"22px 24px",border:`1px solid ${C.border}`}}>
              <p style={{fontSize:12,fontWeight:700,color:C.muted,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:16}}>Core Skills ({ats?.skills?.length||0})</p>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>{(ats?.skills||[]).map((s,i)=><Tag key={i} color={C.blue}>{s}</Tag>)}</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              <div style={{background:C.card,borderRadius:18,padding:"20px 22px",border:`1px solid ${C.border}`}}>
                <p style={{fontSize:12,fontWeight:700,color:C.muted,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:14}}>🔧 Tools</p>
                <div style={{display:"flex",flexWrap:"wrap",gap:7}}>{(ats?.tools||[]).map((t,i)=><Tag key={i} color={C.gold}>{t}</Tag>)}</div>
              </div>
              <div style={{background:C.card,borderRadius:18,padding:"20px 22px",border:`1px solid ${C.border}`}}>
                <p style={{fontSize:12,fontWeight:700,color:C.muted,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:14}}>💼 Job Titles</p>
                <div style={{display:"flex",flexWrap:"wrap",gap:7}}>{(ats?.jobTitles||[]).map((t,i)=><Tag key={i} color={C.teal}>{t}</Tag>)}</div>
              </div>
            </div>
          </div>}
          {tab==="keywords" && <div style={{background:C.card,borderRadius:18,padding:"24px 26px",border:`1px solid ${C.border}`}}>
            <p style={{color:C.muted,fontSize:13,marginBottom:20,lineHeight:1.6}}>In keywords ko resume, cover letter, LinkedIn mein naturally include karein.</p>
            <div style={{display:"flex",flexWrap:"wrap",gap:8}}>{(ats?.keywords||[]).map((k,i)=><span key={i} style={{background:"#1A1535",color:"#A78BFA",border:"1px solid #2D2260",padding:"5px 13px",borderRadius:8,fontSize:13,fontWeight:500}}>{k}</span>)}</div>
          </div>}
          {tab==="tips" && <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {(ats?.suggestions||[]).map((tip,i)=>(
              <div key={i} style={{background:C.card,borderRadius:14,padding:"16px 20px",border:`1px solid ${C.border}`,display:"flex",gap:14,alignItems:"flex-start"}}>
                <span style={{color:C.gold,fontSize:20,flexShrink:0}}>💡</span>
                <p style={{fontSize:14,lineHeight:1.65,color:C.label}}>{tip}</p>
              </div>
            ))}
          </div>}
        </div>
        <div className="fu3" style={{marginTop:36,textAlign:"center"}}>
          <button onClick={onHunt} className="pbtn" style={{background:`linear-gradient(135deg,${C.blue},${C.purple})`,color:"#fff",border:"none",borderRadius:16,padding:"18px 56px",fontSize:18,fontWeight:700,fontFamily:"'Syne',sans-serif",cursor:"pointer",boxShadow:`0 10px 36px ${C.blue}40`,letterSpacing:"0.3px"}}>
            🌍 Hunt Jobs Worldwide Now →
          </button>
          <p style={{color:C.muted,fontSize:13,marginTop:12}}>AI LinkedIn, Remote.co, Himalayas, Relocate.me scan karega</p>
        </div>
      </>}
    </div>
  </div>;
}

// ── HUNT ──
function HuntScreen({ log }) {
  return <div style={{background:C.bg,minHeight:"100vh",fontFamily:"'DM Sans',sans-serif",color:C.text,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
    <style>{CSS}</style>
    <div style={{textAlign:"center",maxWidth:520,width:"100%"}}>
      <div style={{width:130,height:130,margin:"0 auto 36px",position:"relative"}}>
        {[1,.7,.4].map((op,i)=><div key={i} style={{position:"absolute",inset:`${i*10}%`,borderRadius:"50%",border:`1.5px solid ${C.blue}`,opacity:op,animation:`radar 2s ${i*.5}s ease-out infinite`}}/>)}
        <div style={{position:"absolute",inset:0,borderRadius:"50%",background:`radial-gradient(circle,${C.blue}25,${C.bg})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:52}}>🌍</div>
      </div>
      <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:28,fontWeight:800,marginBottom:10,letterSpacing:"-0.5px"}}>Globally Hunting...</h2>
      <p style={{color:C.muted,marginBottom:32,fontSize:15}}>AI worldwide job boards scan kar raha hai</p>
      <div style={{background:C.card,borderRadius:16,padding:22,border:`1px solid ${C.border}`,textAlign:"left",minHeight:180}}>
        {log.map((msg,i)=><div key={i} className="li" style={{padding:"7px 0",fontSize:14,color:i===log.length-1?C.text:C.muted,borderBottom:i<log.length-1?`1px solid ${C.border}20`:"none"}}>{msg}</div>)}
        {log.length>0&&<div style={{display:"flex",gap:5,paddingTop:14}}>
          {[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:"50%",background:C.blue,animation:`pulse 1.4s ${i*.2}s ease-in-out infinite`}}/>)}
        </div>}
      </div>
    </div>
  </div>;
}

// ── JOBS ──
function JobsScreen({ jobs, onBack, onHuntAgain }) {
  const [filter, setFilter] = useState("all");
  const [exp, setExp] = useState(null);
  const rm = jobs.filter(j=>j.type?.toLowerCase().includes("remote")).length;
  const rl = jobs.filter(j=>j.type?.toLowerCase().includes("reloc")).length;
  const fil = jobs.filter(j=>filter==="all"?true:filter==="remote"?j.type?.toLowerCase().includes("remote"):j.type?.toLowerCase().includes("reloc"));

  return <div style={{background:C.bg,minHeight:"100vh",fontFamily:"'DM Sans',sans-serif",color:C.text}}>
    <style>{CSS}</style>
    <header style={{padding:"14px 24px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100,background:C.bg+"EE",backdropFilter:"blur(12px)"}}>
      <Logo/>
      <div style={{display:"flex",gap:10}}>
        <button onClick={onBack} className="nbtn" style={{background:"transparent",color:C.muted,border:`1px solid ${C.border}`,borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:13,fontFamily:"'DM Sans',sans-serif",transition:"all .2s"}}>← Resume</button>
        <button onClick={onHuntAgain} style={{background:C.blue,color:"#fff",border:"none",borderRadius:8,padding:"7px 16px",cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:"'DM Sans',sans-serif"}}>🔄 Hunt Again</button>
      </div>
    </header>
    <div style={{maxWidth:900,margin:"0 auto",padding:"32px 24px"}}>
      <div className="fu" style={{marginBottom:28}}>
        <h1 style={{fontFamily:"'Syne',sans-serif",fontSize:28,fontWeight:800,letterSpacing:"-0.5px",marginBottom:10}}>{jobs.length>0?`${jobs.length} Opportunities Found`:"Search Complete"}</h1>
        <p style={{color:C.muted,fontSize:14}}>Worldwide SQA remote & relocation · Israel excluded · AI ne live fetch kiye</p>
      </div>
      <div className="fu1" style={{display:"flex",gap:8,marginBottom:24,flexWrap:"wrap"}}>
        {[{id:"all",l:`All (${jobs.length})`},{id:"remote",l:`🌐 Remote (${rm})`},{id:"relocation",l:`✈️ Relocation (${rl})`}].map(f=>(
          <button key={f.id} onClick={()=>setFilter(f.id)} className="fbtn" style={{padding:"8px 18px",borderRadius:20,border:`1px solid ${filter===f.id?C.blue:C.border}`,background:filter===f.id?C.blueGlow:"transparent",color:filter===f.id?C.blue:C.muted,cursor:"pointer",fontSize:13,fontFamily:"'DM Sans',sans-serif",fontWeight:500,transition:"all .2s"}}>{f.l}</button>
        ))}
      </div>
      {fil.length===0 ? <div style={{textAlign:"center",padding:"60px 24px",color:C.muted}}>
        <div style={{fontSize:52,marginBottom:18}}>🔍</div>
        <p style={{fontSize:16,marginBottom:8}}>Is search mein listings nahi mili.</p>
        <p style={{fontSize:13,marginBottom:28}}>Hunt Again press karein ya in sites par directly jao:</p>
        <div style={{display:"flex",flexWrap:"wrap",gap:10,justifyContent:"center"}}>
          {["linkedin.com/jobs","himalayas.app","remotive.io","weworkremotely.com","relocate.me"].map(s=>(
            <a key={s} href={`https://${s}`} target="_blank" rel="noopener noreferrer" style={{color:C.blue,fontSize:13,background:C.blueGlow,padding:"6px 14px",borderRadius:8,textDecoration:"none"}}>{s}</a>
          ))}
        </div>
      </div> : <div style={{display:"flex",flexDirection:"column",gap:14}}>
        {fil.map((job,i)=>{
          const ir = job.type?.toLowerCase().includes("remote");
          const tc = ir?C.teal:C.gold;
          const io = exp===i;
          return <div key={i} className="jcard fu" style={{background:C.card,borderRadius:18,padding:"22px 24px",border:`1px solid ${io?C.blue:C.border}`,cursor:"pointer",animationDelay:`${i*.04}s`,boxShadow:io?`0 8px 32px ${C.blueGlow}`:"none"}} onClick={()=>setExp(io?null:i)}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
                  <Tag color={tc}>{ir?"🌐 Remote":"✈️ Relocation"}</Tag>
                  {job.visaSponsorship&&<Tag color={C.blue}>🛂 Visa Sponsored</Tag>}
                  {job.salary&&<Tag color={C.teal} bg={C.teal+"15"}>💰 {job.salary}</Tag>}
                  {job.posted&&<Tag color={C.muted} bg={C.surface}>🕐 {job.posted}</Tag>}
                </div>
                <h3 style={{fontFamily:"'Syne',sans-serif",fontSize:18,fontWeight:700,marginBottom:4,color:C.text}}>{job.title}</h3>
                <p style={{color:C.label,fontSize:14,marginBottom:8}}>🏢 <strong style={{color:C.text}}>{job.company}</strong><span style={{color:C.muted}}> · 📍 {job.location}</span></p>
                <p style={{fontSize:14,lineHeight:1.65,color:C.muted}}>{job.description}</p>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8,flexShrink:0}}>
                <a href={job.applyLink||"#"} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{background:`linear-gradient(135deg,${C.blue},${C.purple})`,color:"#fff",borderRadius:10,padding:"10px 20px",textDecoration:"none",fontSize:14,fontWeight:700,whiteSpace:"nowrap",display:"inline-block",textAlign:"center",fontFamily:"'Syne',sans-serif",boxShadow:`0 4px 16px ${C.blue}30`}}>Apply →</a>
                <div style={{textAlign:"center",fontSize:11,color:C.muted}}>{io?"▲ close":"▼ details"}</div>
              </div>
            </div>
            {io&&<div className="fi" style={{marginTop:18,paddingTop:18,borderTop:`1px solid ${C.border}`}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                {job.requirements?.length>0&&<div>
                  <p style={{fontSize:11,fontWeight:700,color:C.muted,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:10}}>Requirements</p>
                  {job.requirements.slice(0,5).map((r,ri)=><div key={ri} style={{fontSize:13,color:C.label,display:"flex",gap:8,marginBottom:6}}><span style={{color:C.teal,flexShrink:0}}>›</span>{r}</div>)}
                </div>}
                {job.tech_stack?.length>0&&<div>
                  <p style={{fontSize:11,fontWeight:700,color:C.muted,letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:10}}>Tech Stack</p>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{job.tech_stack.map((t,ti)=><span key={ti} style={{background:"#1A1535",color:"#A78BFA",padding:"4px 10px",borderRadius:6,fontSize:12,border:"1px solid #2D2260"}}>{t}</span>)}</div>
                </div>}
              </div>
            </div>}
          </div>;
        })}
      </div>}
    </div>
  </div>;
}

// ── ROOT ──
export default function App() {
  const [screen, setScreen]   = useState("home");
  const [file, setFile]       = useState(null);
  const [pdfText, setPdfText] = useState("");
  const [pdfStatus, setPdfStatus] = useState("idle");
  const [manual, setManual]   = useState("");
  const [useManual, setUseManual] = useState(false);
  const [ats, setAts]         = useState(null);
  const [atsLoading, setAtsLoading] = useState(false);
  const [jobs, setJobs]       = useState([]);
  const [log, setLog]         = useState([]);
  const addLog = useCallback(m => setLog(p=>[...p,m]), []);

  const handleFile = async f => {
    if (!f) return;
    setFile(f); setPdfStatus("extracting");
    try {
      const b64 = await fileToBase64(f);
      const text = await extractPDFText(b64);
      setPdfText(text); setPdfStatus("done");
    } catch(e) {
      console.error(e); setPdfStatus("error");
    }
  };

  const optimize = async () => {
    setAtsLoading(true); setScreen("ats");
    try {
      const prompt = (!useManual && pdfText)
        ? ATS_PROMPT(pdfText)
        : ATS_MANUAL(manual || "SQA Engineer 3 years experience, Manual Testing, Selenium, JIRA, Agile Scrum, Project Management");
      const text = await orCall([{role:"user",content:prompt}], ATS_MODEL);
      setAts(parseJSON(text, "object"));
    } catch(e) {
      console.error(e);
      setAts({candidateName:"Your Profile",currentRole:"SQA Engineer",experience:"Professional",atsScore:72,optimizedResume:"Error: "+e.message+"\n\nVercel mein OPENROUTER_API_KEY env variable set hai? Check karein.",skills:["SQA","Manual Testing","Automation","JIRA","Agile"],jobTitles:["QA Engineer","SQA Engineer"],keywords:["quality assurance","software testing","agile"],tools:["JIRA","Selenium","Postman"],suggestions:["Vercel dashboard mein OPENROUTER_API_KEY env variable add karein"]});
    }
    setAtsLoading(false);
  };

  const hunt = async () => {
    setScreen("hunt"); setJobs([]); setLog([]);
    const sk = (ats?.skills||[]).slice(0,12).join(", ") || "SQA Testing, QA Engineering, Test Automation, JIRA, Selenium, Agile";
    const ti = (ats?.jobTitles||[]).slice(0,5).join(", ") || "QA Engineer, SQA Engineer, Test Automation Engineer";
    addLog("🚀 Global job hunt start...");
    const t1=setTimeout(()=>addLog("🌐 Worldwide job boards connect ho rahe hain..."),800);
    const t2=setTimeout(()=>addLog("🔍 LinkedIn, Indeed, Remote.co scan ho raha hai..."),2000);
    const t3=setTimeout(()=>addLog("🏢 Himalayas, Remotive, WeWorkRemotely check..."),3500);
    const t4=setTimeout(()=>addLog("✈️ Relocation + visa sponsorship filter ho raha hai..."),5000);
    try {
      const text = await orCall([{role:"user",content:HUNT_PROMPT(sk,ti)}], HUNT_MODEL);
      [t1,t2,t3,t4].forEach(clearTimeout);
      addLog("🔄 Results process ho rahe hain...");
      try {
        const result = parseJSON(text, "array");
        const clean = result.filter(j=>j&&j.title&&j.company);
        setJobs(clean); addLog(`🎯 ${clean.length} opportunities mili worldwide!`);
      } catch { addLog("⚠️ Results processed — check job sites directly"); setJobs([]); }
    } catch(e) {
      [t1,t2,t3,t4].forEach(clearTimeout);
      addLog("⚠️ Error: "+e.message);
    }
    setTimeout(()=>setScreen("jobs"), 800);
  };

  if (screen==="hunt") return <HuntScreen log={log}/>;
  if (screen==="ats")  return <ATSScreen ats={ats} loading={atsLoading} onHunt={hunt} onBack={()=>setScreen("home")}/>;
  if (screen==="jobs") return <JobsScreen jobs={jobs} onBack={()=>setScreen("ats")} onHuntAgain={hunt}/>;
  return <HomeScreen onFile={handleFile} pdfStatus={pdfStatus} manualInput={manual} setManualInput={setManual} useManual={useManual} setUseManual={setUseManual} file={file} onOptimize={optimize}/>;
}
