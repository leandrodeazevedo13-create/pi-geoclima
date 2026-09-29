import { useEffect, useRef, useState, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { db } from "./lib/firebase";
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from "firebase/firestore";

type ViewMode = "mapa" | "mural" | "noticias" | "historico";
type Tipo = { simples: string; tecnico: string; emoji: string; categoria: string; risco: "atenção" | "cuidado" | "crítico"; };

const MUNICIPIOS_RMVALE = ["Aparecida","Arapeí","Areias","Bananal","Caçapava","Cachoeira Paulista","Canas","Caraguatatuba","Cruzeiro","Cunha","Guaratinguetá","Igaratá","Ilhabela","Jacareí","Jambeiro","Lagoinha","Lavrinhas","Lorena","Monteiro Lobato","Natividade da Serra","Paraibuna","Pindamonhangaba","Piquete","Potim","Queluz","Redenção da Serra","Roseira","Santa Branca","Santo Antônio do Pinhal","São Bento do Sapucaí","São José do Barreiro","São José dos Campos","São Luiz do Paraitinga","São Sebastião","Silveiras","Taubaté","Tremembé","Ubatuba"].sort();

const COORDS: Record<string, [number, number]> = {
  "Ubatuba": [-23.4342,-45.0835], "Caraguatatuba": [-23.62,-45.4125], "Ilhabela": [-23.7781,-45.3581], "São Sebastião": [-23.76,-45.4097],
  "São José dos Campos": [-23.1791,-45.8869], "Taubaté": [-23.0257,-45.5558], "Jacareí": [-23.305,-45.966], "Pindamonhangaba": [-22.9236,-45.4617],
};

const TIPOS: Tipo[] = [
  { simples: "Rua alagada agora", tecnico: "Alagamento", emoji: "🚫", categoria: "Água/Chuva", risco: "crítico" },
  { simples: "Enxurrada forte", tecnico: "Enxurrada", emoji: "🌊", categoria: "Água/Chuva", risco: "crítico" },
  { simples: "Rio transbordou", tecnico: "Inundação fluvial", emoji: "🏞", categoria: "Água/Chuva", risco: "crítico" },
  { simples: "Mar avançou / ressaca", tecnico: "Ressaca", emoji: "🌊", categoria: "Água/Chuva", risco: "cuidado" },
  { simples: "Bueiro entupido", tecnico: "Bueiro obstruido", emoji: "🕳", categoria: "Infra Urbana", risco: "atenção" },
  { simples: "Rua que sempre alaga", tecnico: "Galeria subdimensionada", emoji: "💧", categoria: "Infra Urbana", risco: "cuidado" },
  { simples: "Barro desceu", tecnico: "Deslizamento", emoji: "⛰", categoria: "Terra/Encosta", risco: "crítico" },
  { simples: "Barranco rachou", tecnico: "Risco deslizamento", emoji: "⚠", categoria: "Terra/Encosta", risco: "cuidado" },
];

type Ponto = { id: string; lat: number; lng: number; municipio: string; bairro: string; rua: string; tipo: Tipo; qtd: number; freq: "Alta"|"Média"|"Baixa"; statusRua: "Livre"|"Alagada"|"Interditada"|"Risco"; statusMod?: string; foto?: string; obs?: string; quando: string; };

const INICIAL: Ponto[] = [
  { id: "inicial-1", lat: -23.4342, lng: -45.0835, municipio: "Ubatuba", bairro: "Centro", rua: "Rua Piauí, 90", tipo: TIPOS[0], qtd: 12, freq: "Alta", quando: "Agora há 5 min", statusRua: "Interditada", statusMod: "aprovado", obs: "Água na altura do joelho, carros não passam, precisa interditar", foto: "https://images.unsplash.com/photo-1547683905-f686c993aae5?w=400" },
  { id: "inicial-2", lat: -23.4345, lng: -45.084, municipio: "Ubatuba", bairro: "Estufa II", rua: "Rua Acre", tipo: TIPOS[5], qtd: 8, freq: "Alta", quando: "Hoje 06h", statusRua: "Alagada", statusMod: "aprovado", obs: "Bueiro entupido, água voltando, mau cheiro, já ligamos pra prefeitura", foto: "https://images.unsplash.com/photo-1586776802477-3685a84925c3?w=400" },
];

function getTrianguloIcon(risco: "atenção" | "cuidado" | "crítico", qtd: number) {
  const cores = { "atenção": "#facc15", "cuidado": "#fb923c", "crítico": "#ef4444" };
  const cor = cores[risco];
  return L.divIcon({ html: `<div style="position:relative; width:36px; height:36px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));"><svg width="36" height="36" viewBox="0 0 36 36"><polygon points="18,2 34,32 2,32" fill="${cor}" stroke="black" stroke-width="2" stroke-linejoin="round"/><text x="18" y="26" text-anchor="middle" font-size="16" font-weight="900" fill="black">!</text></svg><div style="position:absolute; bottom:-6px; left:50%; transform:translateX(-50%); background:black; color:white; font-size:9px; font-weight:900; padding:1px 4px; border-radius:10px;">${qtd}x</div></div>`, iconSize: [36,36], iconAnchor:[18,32] });
}

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>("mapa");
  const [pontos, setPontos] = useState<Ponto[]>(INICIAL);
  const [municipioFiltro, setMunicipioFiltro] = useState("Todos - 39");
  const [formMunicipio, setFormMunicipio] = useState("Ubatuba");
  const [formBairro, setFormBairro] = useState("");
  const [formRua, setFormRua] = useState("");
  const [formTipoIdx, setFormTipoIdx] = useState(0);
  const [formObs, setFormObs] = useState("");
  const [formFoto, setFormFoto] = useState<string | null>(null);
  const [formStatus, setFormStatus] = useState<Ponto["statusRua"]>("Alagada");
  const [altoContraste, setAltoContraste] = useState(false);
  const [fonteGrande, setFonteGrande] = useState(false);
  const [showAcess, setShowAcess] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const [noticiasOficiais] = useState<any[]>([
    { fonte: "CEMADEN", titulo: "Alerta: Chuva moderada em Ubatuba e Caraguá nas próximas 2h", cor: "bg-red-600", desc: "Acumulado previsto 30mm. Atenção moradores de áreas de encosta.", time: "Há 2h" },
    { fonte: "Defesa Civil SP", titulo: "Maré alta + ressaca - Litoral Norte em atenção", cor: "bg-orange-500", desc: "Ondas de até 2.5m. Evitem áreas de praia.", time: "Há 5h" },
    { fonte: "INMET", titulo: "Acumulado 45mm em SJC nas últimas 24h - Fonte: GOES-16", cor: "bg-blue-600", desc: "Previsão de mais chuva nas próximas horas.", time: "Hoje 06h" },
  ]);

  function falar(texto: string){ if(!("speechSynthesis" in window)) return; window.speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(texto); u.lang="pt-BR"; u.rate=0.9; window.speechSynthesis.speak(u); }
  async function compartilhar(p: Ponto){ const t=`🚨 GeoClima Vale - ${p.municipio} - ${p.rua} - ${p.tipo.simples} - ${p.obs||""}`; if((navigator as any).share){ try{ await (navigator as any).share({title:p.municipio,text:t,url:location.href}); return; }catch{} } await navigator.clipboard.writeText(t+" "+location.href); alert("📋 Copiado!"); }

  useEffect(()=>{ if(document.getElementById('vlibras-script')) return; const div=document.createElement('div'); div.setAttribute('vw',''); div.className='enabled'; div.innerHTML=`<div vw-access-button class="active"></div><div vw-plugin-wrapper><div class="vw-plugin-top-wrapper"></div></div>`; document.body.appendChild(div); const s=document.createElement('script'); s.id='vlibras-script'; s.src='https://vlibras.gov.br/app/vlibras-plugin.js'; s.async=true; s.onload=()=>{ const w=window as any; if(w.VLibras) new w.VLibras.Widget('https://vlibras.gov.br/app'); }; document.body.appendChild(s); }, []);

  useEffect(()=>{
    const q = query(collection(db, "ocorrencias"), orderBy("createdAt","desc"));
    const unsub = onSnapshot(q, snap=>{
      const fb: Ponto[] = snap.docs.map(d=>{ const data=d.data(); if(data.statusMod==="rejeitado"||data.statusMod==="pendente") return null as any; return { id:d.id, lat:data.lat, lng:data.lng, municipio:data.municipio, bairro:data.bairro, rua:data.rua, tipo:TIPOS[data.tipoIdx]||TIPOS[0], qtd:data.qtd||1, freq:data.qtd>6?"Alta":data.qtd>2?"Média":"Baixa", statusRua:data.statusRua||"Alagada", statusMod:data.statusMod||"aprovado", foto:data.foto, obs:data.obs, quando:data.quando||"Agora" }; }).filter(Boolean);
      setPontos([...fb, ...INICIAL]);
    });
    return ()=>unsub();
  }, []);

  // MAPA FIXO - ZOOM 15 (ANTES 17 MUITO PERTO, AGORA UM POUCO MAIS LONGE)
  useEffect(()=>{
    if(!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, { center: [-23.4342,-45.0835], zoom: 15, zoomControl:false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution:"© OpenStreetMap" }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map); mapRef.current = map;
    if(navigator.geolocation){ navigator.geolocation.getCurrentPosition(pos=> map.setView([pos.coords.latitude, pos.coords.longitude], 15), ()=> map.setView([INICIAL[0].lat, INICIAL[0].lng], 15)); }
    return ()=>{ map.remove(); mapRef.current=null; };
  }, []);
  useEffect(()=>{ if(viewMode==="mapa" && mapRef.current){ setTimeout(()=>{ mapRef.current?.invalidateSize(); }, 250); } }, [viewMode]);

  const filtrados = useMemo(()=> pontos.filter(p=> municipioFiltro==="Todos - 39"||municipioFiltro==="Todos"||p.municipio===municipioFiltro), [pontos,municipioFiltro]);

  useEffect(()=>{
    if(!markersRef.current) return; markersRef.current.clearLayers();
    filtrados.forEach(p=>{
      const marker=L.marker([p.lat,p.lng],{icon:getTrianguloIcon(p.tipo.risco,p.qtd)});
      const popup=`<div style="font-family:sans-serif; min-width:220px;"><b>${p.municipio} - ${p.rua}</b><br/>${p.tipo.tecnico} - ${p.tipo.risco.toUpperCase()}<br/>${p.foto?`<img src="${p.foto}" style="width:100%; height:100px; object-fit:cover; border-radius:8px; margin:6px 0;" onerror="this.style.display='none'" />`:""}<div style="font-size:11px; background:#f8fafc; padding:6px; border-radius:6px; margin-top:4px;">${p.obs||"Sem descrição"}</div><div style="font-size:10px; opacity:0.6; margin-top:4px;">${p.qtd} conf • ${p.quando} • ${p.statusRua}</div></div>`;
      const tooltip=`<div>${p.foto?`<img src="${p.foto}" style="width:140px; height:90px; object-fit:cover; border-radius:8px;" onerror="this.style.display='none'" />`:"📍"}<div style="font-size:10px; font-weight:bold; margin-top:4px;">${p.rua}<br/>${(p.obs||"").slice(0,40)}</div></div>`;
      marker.bindPopup(popup); marker.bindTooltip(tooltip,{direction:"top", offset:[0,-20], opacity:0.95} as any); marker.addTo(markersRef.current!);
    });
  }, [filtrados]);

  const locaisCriticos = useMemo(()=>{ const m: Record<string,{count:number;ponto:Ponto}>={}; pontos.forEach(p=>{ const k=`${p.municipio} - ${p.rua}`; if(!m[k]) m[k]={count:0,ponto:p}; m[k].count+=p.qtd; }); return Object.entries(m).sort((a,b)=>b[1].count-a[1].count).slice(0,10); }, [pontos]);

  async function handleEnviar(e: React.FormEvent){
    e.preventDefault(); if(!formRua||!formBairro){ alert("Preencha bairro e rua"); return; }
    const coords=COORDS[formMunicipio]||[-23.4342,-45.0835]; const lat=coords[0]+(Math.random()-0.5)*0.02; const lng=coords[1]+(Math.random()-0.5)*0.02;
    try{ await addDoc(collection(db,"ocorrencias"),{lat,lng,municipio:formMunicipio,bairro:formBairro,rua:formRua,tipoIdx:formTipoIdx,qtd:1,statusRua:formStatus,statusMod:"pendente",foto:formFoto,obs:formObs,quando:new Date().toLocaleString("pt-BR"),createdAt:serverTimestamp()}); alert("✅ Enviado para moderação CEMADEN!"); setFormBairro(""); setFormRua(""); setFormObs(""); setFormFoto(null); }catch(err:any){ alert(err.message); }
  }
  function handleFoto(e: React.ChangeEvent<HTMLInputElement>){ const f=e.target.files?.[0]; if(!f) return; const r=new FileReader(); r.onload=()=>setFormFoto(r.result as string); r.readAsDataURL(f); }

  return (
    <div className={`${fonteGrande?"text-[18px]":""} ${altoContraste?"bg-black text-yellow-300":"bg-[#f8fafc] text-slate-900"} min-h-screen font-sans pb-[90px] md:pb-0`}>
      <div className="bg-red-600 text-white font-bold overflow-hidden" style={{height:'32px'}}><style>{`@keyframes marquee{0%{transform:translateX(100%)}100%{transform:translateX(-100%)}}.animate-marquee{animation:marquee 30s linear infinite; white-space:nowrap; display:flex; gap:2rem; align-items:center; height:32px;}`}</style><div className="animate-marquee text-[12px]">{[...noticiasOficiais,...noticiasOficiais].map((n,i)=><span key={i} className="flex items-center gap-2"><span className={`${n.cor} px-2 py-0.5 rounded-full text-[10px]`}>{n.fonte}</span>{n.titulo}</span>)}</div></div>
      <header className={`${altoContraste?"bg-black border-yellow-300 border-b":"bg-white border-b"} sticky top-0 z-40`}>
        <div className="max-w-[1440px] mx-auto px-4 py-2 flex justify-between items-center"><div className="text-[10px] opacity-60">Vale do Paraíba e Litoral Norte • 39 municípios • UNIVESP • Só aprovados • Zoom 15 rua</div><div className="flex gap-2"><select value={municipioFiltro} onChange={e=>setMunicipioFiltro(e.target.value)} className="border rounded-full px-3 py-1 text-[12px] bg-white text-black"><option>Todos - 39 ({pontos.length})</option>{MUNICIPIOS_RMVALE.map(m=><option key={m}>{m}</option>)}</select><button onClick={()=>{ if(navigator.geolocation) navigator.geolocation.getCurrentPosition(p=> mapRef.current?.setView([p.coords.latitude, p.coords.longitude], 15))}} className="bg-blue-600 text-white px-4 py-1 rounded-full text-[12px] font-bold">Minha localização</button><a href="/painel" className="bg-black text-white px-4 py-1 rounded-full text-[12px] font-bold hidden md:block">Painel ADM</a></div></div>
        <div className="flex gap-2 px-4 pb-2"><span className="px-4 py-1.5 rounded-full text-[12px] font-bold bg-black text-white">Mapa Colaborativo</span><span className="text-[10px] opacity-60 py-1.5">Morador - só aprovados com descrição</span></div>
      </header>

      <main className="grid md:grid-cols-[380px_1fr_360px] gap-3 p-3 max-w-[1440px] mx-auto">
        {/* ESQUERDA - SEM HISTÓRICO AGORA */}
        <section className={`${altoContraste?"bg-black border-yellow-300 border":"bg-white border"} rounded-2xl p-4 h-fit sticky top-[100px]`}>
          <h2 className="font-black text-[12px] uppercase">REGISTRAR OCORRÊNCIA - ACESSÍVEL A TODOS</h2>
          <p className="text-[11px] opacity-60 mt-1">Descreva em áudio 🎤 ou texto - vai para moderação</p>
          <form onSubmit={handleEnviar} className="mt-4 space-y-3">
            <select value={formMunicipio} onChange={e=>setFormMunicipio(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-[12px] bg-white text-black">{MUNICIPIOS_RMVALE.map(m=><option key={m}>{m}</option>)}</select>
            <input value={formBairro} onChange={e=>setFormBairro(e.target.value)} placeholder="Bairro (ex: Centro)" className="w-full border rounded-xl px-3 py-2 text-[12px] bg-white text-black"/>
            <input value={formRua} onChange={e=>setFormRua(e.target.value)} placeholder="Rua e número (ex: Piaui, 90)" className="w-full border rounded-xl px-3 py-2 text-[12px] bg-white text-black"/>
            <select value={formTipoIdx} onChange={e=>setFormTipoIdx(Number(e.target.value))} className="w-full border rounded-xl px-3 py-2 text-[12px] bg-white text-black font-bold">{TIPOS.map((t,i)=><option key={i} value={i}>{t.emoji} {t.simples} - {t.risco.toUpperCase()}</option>)}</select>
            <select value={formStatus} onChange={e=>setFormStatus(e.target.value as any)} className="w-full border rounded-xl px-3 py-2 text-[12px] bg-white text-black"><option>Alagada</option><option>Interditada</option><option>Risco</option><option>Livre</option></select>
            <div className="relative"><textarea value={formObs} onChange={e=>setFormObs(e.target.value)} placeholder="Descreva a ocorrência... (vai aparecer nos aprovados)" className="w-full border rounded-xl px-3 py-2 text-[12px] min-h-[90px] bg-white text-black" /><button type="button" onClick={()=>{ const rec = new (window as any).webkitSpeechRecognition(); rec.lang="pt-BR"; rec.onresult=(ev:any)=>setFormObs(ev.results[0][0].transcript); rec.start(); }} className="absolute bottom-2 right-2 bg-black text-white w-8 h-8 rounded-full">🎤</button></div>
            <div className="space-y-2"><div className="text-[11px] font-bold">Foto prova (opcional)</div><div className="flex gap-2"><label className="flex-1 bg-blue-600 text-white text-[11px] font-bold py-2 rounded-full text-center cursor-pointer">📷 Câmera<input type="file" accept="image/*" capture="environment" onChange={handleFoto} className="hidden"/></label><label className="flex-1 bg-gray-900 text-white text-[11px] font-bold py-2 rounded-full text-center cursor-pointer">🖼 Galeria<input type="file" accept="image/*" onChange={handleFoto} className="hidden"/></label></div>{formFoto && <img src={formFoto} className="w-full h-32 object-cover rounded-xl border" onError={e=>{(e.target as any).style.display='none'}}/>}</div>
            <button type="submit" className="w-full bg-black text-white py-3 rounded-full font-black text-[12px]">Registrar - {formMunicipio} (moderação)</button>
          </form>
        </section>

        {/* MEIO - MAPA / MURAL / NOTICIAS / HISTORICO */}
        <section className="h-[80vh] md:h-[calc(100vh-140px)] rounded-2xl overflow-hidden border relative bg-gray-100 flex flex-col">
          <div className="bg-white border-b flex flex-col items-center justify-center py-3 z-[400] shadow-sm"><div className="flex items-center gap-3"><div className="w-10 h-10 bg-black text-white rounded-xl flex items-center justify-center font-black">GC</div><div className="text-center"><div className="font-black tracking-[0.25em] text-[15px]">GEOCLIMA VALE</div><div className="text-[10px] opacity-60">39 municípios • UNIVESP • Zoom 15</div></div></div></div>
          <div className="relative flex-1 overflow-hidden bg-[#f8fafc]">
            <div className={`absolute inset-0 ${viewMode==="mapa"?"block":"hidden"}`}><div ref={mapContainerRef} className="absolute inset-0" /><div className="absolute top-3 left-1/2 -translate-x-1/2 z-[400] bg-black text-white px-4 py-1 rounded-full text-[11px] font-black">MAPA DE MONITORAMENTO DE OCORRÊNCIA</div><div className="absolute top-12 left-3 z-[400] bg-white/90 px-3 py-1 rounded-full text-[10px] font-bold shadow">📍 {filtrados.length} aprovados • 🔺 Hover mostra foto • Zoom 15 (um pouco mais longe)</div></div>
            {viewMode==="mural" && <div className="absolute inset-0 overflow-auto p-3 space-y-4"><div className="max-w-[500px] mx-auto space-y-4">{filtrados.map(p=><div key={p.id} className="bg-white border rounded-[20px] overflow-hidden shadow-sm">{p.foto && <img src={p.foto} className="w-full h-[260px] object-cover" onError={e=>{(e.target as any).style.display='none'}}/>}<div className="p-3"><div className="font-black text-[13px]">📍 {p.municipio} - {p.bairro}</div><div className="text-[11px] opacity-70">{p.rua} • {p.quando} • {p.statusRua}</div><div className="bg-gray-50 border rounded-xl p-2 mt-2 text-[12px]"><b>Descrição:</b> {p.obs || "Sem descrição"}</div><div className="flex gap-2 mt-3"><button className="flex-1 bg-gray-900 text-white py-2 rounded-full text-[11px] font-bold">👍 Vi também ({p.qtd})</button><button onClick={()=> compartilhar(p)} className="px-4 bg-blue-600 text-white py-2 rounded-full text-[11px]">📤 Compartilhar</button></div></div></div>)}</div></div>}
            {viewMode==="noticias" && <div className="absolute inset-0 overflow-auto p-4 space-y-3">{noticiasOficiais.map((n,i)=><div key={i} className="bg-white border rounded-2xl p-4 flex gap-3"><div className={`w-10 h-10 ${n.cor} rounded-full flex items-center justify-center text-white font-black text-[10px]`}>{n.fonte.slice(0,2)}</div><div><div className="font-black text-[13px]">{n.titulo}</div><div className="text-[11px] opacity-70 mt-1">{n.desc}</div></div></div>)}</div>}
            {viewMode==="historico" && <div className="absolute inset-0 overflow-auto p-4 space-y-4 bg-white">
              <h3 className="font-black text-[14px]">🔥 HISTÓRICO DE OCORRÊNCIAS - LOCAIS CRÍTICOS (90d)</h3>
              <p className="text-[11px] opacity-60">Ranking de ruas que mais alagaram/deslizaram nos últimos 90 dias - dados para Defesa Civil</p>
              <div className="space-y-2">{locaisCriticos.map(([chave, {count, ponto}], i)=><div key={chave} onClick={()=> { setViewMode("mapa"); setTimeout(()=> mapRef.current?.setView([ponto.lat, ponto.lng], 15), 100)}} className="flex items-center gap-3 bg-[#f8fafc] border p-3 rounded-xl cursor-pointer hover:border-black"><div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-white text-[12px] ${count>6?"bg-red-600":count>2?"bg-orange-500":"bg-yellow-500"}`}>{i+1}</div><div className="flex-1"><div className="font-bold text-[12px]">{chave}</div><div className="text-[10px] opacity-60">{ponto.bairro} • {ponto.tipo.simples} • Último: {ponto.quando}</div><div className="text-[11px] mt-1 bg-white border rounded-lg p-2">{ponto.obs || "Sem descrição"}</div></div><div className="text-right"><div className={`text-[11px] px-3 py-1 rounded-full font-black text-white ${count>6?"bg-red-600":count>2?"bg-orange-500":"bg-yellow-500"}`}>{count}x</div><div className="text-[9px] opacity-60 mt-1">{ponto.freq}</div></div></div>)}</div>
              <div className="bg-[#0f172a] text-white rounded-xl p-4"><div className="font-black text-[11px]">📊 ESTATÍSTICAS 90d</div><div className="grid grid-cols-3 gap-3 mt-3"><div className="bg-white/10 rounded-xl p-3 text-center"><div className="text-2xl font-black">{pontos.length}</div><div className="text-[10px] opacity-60">Total aprovados</div></div><div className="bg-red-500/20 rounded-xl p-3 text-center border border-red-500/30"><div className="text-2xl font-black text-red-400">{pontos.filter(p=>p.tipo.risco==="crítico").length}</div><div className="text-[10px] text-red-300">Críticos 🔴</div></div><div className="bg-white rounded-xl p-3 text-center text-black"><div className="text-2xl font-black">{pontos.filter(p=>p.foto).length}</div><div className="text-[10px] font-bold">Com foto</div></div></div></div>
            </div>}
          </div>
        </section>

        {/* DIREITA - AGORA COM DESCRIÇÃO */}
        <section className="space-y-3 hidden md:block">
          <div className="bg-white border rounded-2xl p-3">
            <h3 className="font-black text-[11px]">OCORRÊNCIAS COM FOTOS - APROVADOS - COM DESCRIÇÃO</h3>
            <div className="mt-2 space-y-3 max-h-[70vh] overflow-auto">
              {filtrados.map(p=><div key={p.id} onClick={()=> { setViewMode("mapa"); setTimeout(()=> mapRef.current?.setView([p.lat, p.lng], 15), 100)}} className="border rounded-2xl p-3 cursor-pointer hover:border-black bg-white">
                <div className="flex justify-between items-start gap-2"><div className="font-black text-[11px]">{p.municipio} - {p.rua}</div><span className={`text-[8px] px-2 py-1 rounded-full font-black h-fit ${p.statusRua==="Interditada"?"bg-red-600 text-white":"bg-orange-500 text-white"}`}>{p.statusRua}</span></div>
                <div className="text-[10px] opacity-60">{p.bairro} • {p.quando} • {p.qtd} conf • {p.tipo.risco}</div>
                {p.foto && <img src={p.foto} className="w-full h-28 object-cover rounded-xl mt-2" onError={e=>{(e.target as any).style.display='none'}}/>}
                <div className="bg-gray-50 border rounded-xl p-2 mt-2 text-[11px]"><span className="font-bold">Descrição:</span> {p.obs || "Sem descrição - apenas foto prova"}</div>
                <div className="flex gap-1 mt-2"><button onClick={(e)=>{ e.stopPropagation(); falar(`${p.municipio}, ${p.rua}, ${p.obs}`)}} className="flex-1 bg-black text-white px-3 py-1.5 rounded-full text-[9px] font-bold">🔊 Ouvir descrição</button><button onClick={(e)=>{ e.stopPropagation(); compartilhar(p);}} className="flex-1 bg-blue-600 text-white px-3 py-1.5 rounded-full text-[9px] font-bold">📤 Compartilhar</button></div>
              </div>)}
            </div>
          </div>
        </section>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-[5000] bg-white/95 backdrop-blur border-t shadow-[0_-4px_20px_rgba(0,0,0,0.1)] md:bottom-4 md:left-1/2 md:-translate-x-1/2 md:w-auto md:rounded-full md:border md:px-2 md:py-1">
        <div className="flex justify-center gap-1 py-2 md:py-1">
          <button onClick={()=>setViewMode("mapa")} className={`flex flex-col md:flex-row items-center gap-1 px-5 py-1.5 rounded-full transition-all ${viewMode==="mapa"?"bg-black text-white shadow-lg":"text-gray-500"}`}><span className="text-[18px]">🗺️</span><span className="text-[11px] font-bold">Mapa</span></button>
          <button onClick={()=>setViewMode("mural")} className={`flex flex-col md:flex-row items-center gap-1 px-5 py-1.5 rounded-full transition-all ${viewMode==="mural"?"bg-black text-white shadow-lg":"text-gray-500"}`}><span className="text-[18px]">🎞️</span><span className="text-[11px] font-bold">Mural</span></button>
          <button onClick={()=>setViewMode("noticias")} className={`flex flex-col md:flex-row items-center gap-1 px-5 py-1.5 rounded-full transition-all ${viewMode==="noticias"?"bg-black text-white shadow-lg":"text-gray-500"}`}><span className="text-[18px]">📰</span><span className="text-[11px] font-bold">Notícias</span></button>
          <button onClick={()=>setViewMode("historico")} className={`flex flex-col md:flex-row items-center gap-1 px-5 py-1.5 rounded-full transition-all ${viewMode==="historico"?"bg-black text-white shadow-lg":"text-gray-500"}`}><span className="text-[18px]">📊</span><span className="text-[11px] font-bold">Histórico</span></button>
        </div>
      </nav>

      <button onClick={()=>setShowAcess(!showAcess)} className="fixed bottom-[90px] md:bottom-5 right-5 z-[6000] w-14 h-14 bg-[#0a3d9c] text-white rounded-full shadow-xl flex flex-col items-center justify-center border-2 border-white"><span className="text-[20px]">♿</span><span className="text-[10px]">🤟</span></button>
      {showAcess && <div className="fixed inset-0 z-[9998] bg-black/30 flex justify-end"><div className="bg-[#f5f5f5] w-[92%] max-w-[380px] h-full ml-auto shadow-2xl border-l"><div className="p-4 flex justify-between items-center border-b bg-white"><div className="font-black">Acessibilidade</div><button onClick={()=>setShowAcess(false)} className="w-8 h-8 rounded-full bg-gray-100">✕</button></div><div className="p-4 grid grid-cols-2 gap-3"><button onClick={()=>setFonteGrande(!fonteGrande)} className="bg-white border p-4 rounded-2xl text-left"><div className="text-2xl font-black">A+</div><div className="text-[12px] font-bold">Fonte</div></button><button onClick={()=>setAltoContraste(!altoContraste)} className="bg-white border p-4 rounded-2xl text-left"><div>◐</div><div className="text-[12px] font-bold">Contraste</div></button></div></div></div>}
    </div>
  );
}
