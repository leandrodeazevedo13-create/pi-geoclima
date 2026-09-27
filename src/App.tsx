import { useEffect, useRef, useState, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { db } from "./lib/firebase";
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, deleteDoc, doc } from "firebase/firestore";

type Tab = "usuario" | "adm";
type ViewMode = "mapa" | "fotos" | "mural" | "noticias";
type Categoria = "Água/Chuva" | "Terra/Encosta" | "Vento/Tempo" | "Infra Urbana";
type Tipo = { simples: string; tecnico: string; emoji: string; categoria: Categoria; risco: "atenção" | "cuidado" | "crítico"; };

const MUNICIPIOS_RMVALE = [
  "Aparecida","Arapeí","Areias","Bananal","Caçapava","Cachoeira Paulista","Canas","Caraguatatuba","Cruzeiro","Cunha","Guaratinguetá","Igaratá","Ilhabela","Jacareí","Jambeiro","Lagoinha","Lavrinhas","Lorena","Monteiro Lobato","Natividade da Serra","Paraibuna","Pindamonhangaba","Piquete","Potim","Queluz","Redenção da Serra","Roseira","Santa Branca","Santo Antônio do Pinhal","São Bento do Sapucaí","São José do Barreiro","São José dos Campos","São Luiz do Paraitinga","São Sebastião","Silveiras","Taubaté","Tremembé","Ubatuba"
].sort();

const COORDS: Record<string, [number, number]> = {
  "Ubatuba": [-23.4342,-45.0835], "Caraguatatuba": [-23.62,-45.4125], "Ilhabela": [-23.7781,-45.3581], "São Sebastião": [-23.76,-45.4097],
  "São José dos Campos": [-23.1791,-45.8869], "Taubaté": [-23.0257,-45.5558], "Jacareí": [-23.305,-45.966], "Pindamonhangaba": [-22.9236,-45.4617],
  "Guaratinguetá": [-22.81,-45.1928], "Lorena": [-22.7328,-45.1269], "Cruzeiro": [-22.5733,-44.9639],
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
  { simples: "Árvore caiu", tecnico: "Queda de arvore", emoji: "🌳", categoria: "Vento/Tempo", risco: "cuidado" },
  { simples: "Lixo entulho", tecnico: "Acumulo residuos", emoji: "🗑", categoria: "Infra Urbana", risco: "atenção" },
  { simples: "Mato alto", tecnico: "Vegetacao", emoji: "🌿", categoria: "Infra Urbana", risco: "atenção" },
];

type Ponto = { 
  id: string; 
  lat: number; lng: number; 
  municipio: string; bairro: string; rua: string; 
  tipo: Tipo; qtd: number; freq: "Alta" | "Média" | "Baixa"; 
  statusRua: "Livre" | "Alagada" | "Interditada" | "Risco"; 
  foto?: string; obs?: string; quando: string; 
  createdAt?: any;
};

const INICIAL: Ponto[] = [
  { id: "inicial-1", lat: -23.4342, lng: -45.0835, municipio: "Ubatuba", bairro: "Centro", rua: "Rua Piauí, 90", tipo: TIPOS[0], qtd: 12, freq: "Alta", quando: "Ontem 18h", statusRua: "Interditada", foto: "https://images.unsplash.com/photo-1547683905-f686c993aae5?w=400", obs: "Água na altura do joelho" },
  { id: "inicial-2", lat: -23.4345, lng: -45.084, municipio: "Ubatuba", bairro: "Estufa II", rua: "Rua Acre", tipo: TIPOS[5], qtd: 8, freq: "Alta", quando: "Hoje 06h", statusRua: "Alagada", foto: "https://images.unsplash.com/photo-1586776802477-3685a84925c3?w=400", obs: "Bueiro entupido" },
];

function getTrianguloIcon(risco: "atenção" | "cuidado" | "crítico", qtd: number) {
  const cores = { "atenção": "#facc15", "cuidado": "#fb923c", "crítico": "#ef4444" };
  const cor = cores[risco];
  const html = `<div style="position:relative; width:36px; height:36px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));"><svg width="36" height="36" viewBox="0 0 36 36"><polygon points="18,2 34,32 2,32" fill="${cor}" stroke="black" stroke-width="2" stroke-linejoin="round"/><text x="18" y="26" text-anchor="middle" font-size="16" font-weight="900" fill="black">!</text></svg><div style="position:absolute; bottom:-6px; left:50%; transform:translateX(-50%); background:black; color:white; font-size:9px; font-weight:900; padding:1px 4px; border-radius:10px;">${qtd}x</div></div>`;
  return L.divIcon({ html, className: "triangulo-marker", iconSize: [36, 36], iconAnchor: [18, 32] });
}

export default function App() {
  const [tab, setTab] = useState<Tab>("usuario");
  const [viewMode, setViewMode] = useState<ViewMode>("mapa");
  const [pontos, setPontos] = useState<Ponto[]>(INICIAL);
  const [municipioFiltro, setMunicipioFiltro] = useState("Todos - 39");
  const [categoriaFiltro] = useState("Todas");
  
  const [formMunicipio, setFormMunicipio] = useState("Ubatuba");
  const [formBairro, setFormBairro] = useState("");
  const [formRua, setFormRua] = useState("");
  const [formTipoIdx, setFormTipoIdx] = useState(0);
  const [formObs, setFormObs] = useState("");
  const [formFoto, setFormFoto] = useState<string | null>(null);
  const [formStatus, setFormStatus] = useState<Ponto["statusRua"]>("Alagada");

  const [altoContraste, setAltoContraste] = useState(false);
  const [fonteGrande, setFonteGrande] = useState(false);
  const [leitorAtivo, setLeitorAtivo] = useState(false);
  const [showAcess, setShowAcess] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);

  const [noticiasOficiais, setNoticiasOficiais] = useState<any[]>([]);

  function falar(texto: string) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(texto);
    utter.lang = "pt-BR"; utter.rate = 0.9;
    window.speechSynthesis.speak(utter);
    setLeitorAtivo(true);
    utter.onend = () => setLeitorAtivo(false);
  }

  async function compartilhar(p: Ponto) {
    const texto = `🚨 GeoClima Vale - ${p.municipio} - ${p.rua} - ${p.tipo.simples} - ${p.tipo.risco.toUpperCase()} - ${p.qtd} confirmações - ${p.quando}`;
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: `GeoClima Vale - ${p.municipio}`, text: texto, url }); return; } catch {}
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(`${texto} - ${url}`);
      alert("📋 Link copiado! Cole no WhatsApp");
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(texto + " " + url)}`, "_blank");
    }
  }

  useEffect(() => {
    if (document.getElementById('vlibras-script')) return;
    const div = document.createElement('div');
    div.setAttribute('vw', ''); div.className = 'enabled';
    div.innerHTML = `<div vw-access-button class="active"></div><div vw-plugin-wrapper><div class="vw-plugin-top-wrapper"></div></div>`;
    document.body.appendChild(div);
    const script = document.createElement('script');
    script.id = 'vlibras-script';
    script.src = 'https://vlibras.gov.br/app/vlibras-plugin.js';
    script.async = true;
    script.onload = () => {
      const w = window as any;
      if (w.VLibras) { new w.VLibras.Widget('https://vlibras.gov.br/app'); }
    };
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    setNoticiasOficiais([
      { fonte: "CEMADEN", titulo: "Alerta: Chuva moderada em Ubatuba e Caraguá nas próximas 2h", cor: "bg-red-600", desc: "Acumulado previsto 30mm. Atenção moradores de áreas de encosta.", time: "Há 2h", link: "#" },
      { fonte: "Defesa Civil SP", titulo: "Maré alta + ressaca - Litoral Norte em atenção", cor: "bg-orange-500", desc: "Ondas de até 2.5m. Evitem áreas de praia.", time: "Há 5h", link: "#" },
      { fonte: "INMET", titulo: "Acumulado 45mm em SJC nas últimas 24h - Fonte: GOES-16", cor: "bg-blue-600", desc: "Previsão de mais chuva nas próximas horas.", time: "Hoje 06h", link: "#" },
    ]);
  }, []);

  useEffect(() => {
    const q = query(collection(db, "ocorrencias"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, snap => {
      const fbPontos: Ponto[] = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id, lat: data.lat, lng: data.lng,
          municipio: data.municipio, bairro: data.bairro, rua: data.rua,
          tipo: TIPOS[data.tipoIdx] || TIPOS[0],
          qtd: data.qtd || 1, freq: data.qtd > 6 ? "Alta" : data.qtd > 2 ? "Média" : "Baixa",
          statusRua: data.statusRua || "Alagada",
          foto: data.foto, obs: data.obs, quando: data.quando || "Agora", createdAt: data.createdAt
        };
      });
      setPontos([...fbPontos, ...INICIAL]);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, { center: [-23.2, -45.8], zoom: 9, zoomControl: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => { map.setView([pos.coords.latitude, pos.coords.longitude], 14); },
        () => { if (pontos.length > 0) map.setView([pontos[0].lat, pontos[0].lng], 13); }
      );
    }
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  const filtrados = useMemo(() => {
    return pontos.filter(p => {
      const munOk = municipioFiltro === "Todos - 39" || municipioFiltro === "Todos" || p.municipio === municipioFiltro;
      const catOk = categoriaFiltro === "Todas" || p.tipo.categoria === categoriaFiltro;
      return munOk && catOk;
    });
  }, [pontos, municipioFiltro, categoriaFiltro]);

  useEffect(() => {
    if (!markersRef.current) return;
    markersRef.current.clearLayers();
    filtrados.forEach(p => {
      const marker = L.marker([p.lat, p.lng], { icon: getTrianguloIcon(p.tipo.risco, p.qtd) });
      // POPUP COM FOTO + TOOLTIP HOVER FOTO
      const popupHtml = `
        <div style="font-family:sans-serif; min-width:200px;">
          <b>${p.municipio} - ${p.rua}</b><br/>
          ${p.tipo.tecnico} - ${p.tipo.risco.toUpperCase()}<br/>
          ${p.foto ? `<img src="${p.foto}" style="width:100%; height:100px; object-fit:cover; border-radius:8px; margin:6px 0;" />` : ""}
          <div style="font-size:11px;">${p.obs || ""} • ${p.qtd} conf • ${p.quando}</div>
        </div>`;
      const tooltipHtml = `
        <div style="font-family:sans-serif;">
          ${p.foto ? `<img src="${p.foto}" style="width:140px; height:90px; object-fit:cover; border-radius:8px;" />` : "📷 Sem foto"}
          <div style="font-size:10px; font-weight:bold; margin-top:4px;">${p.rua} - ${p.tipo.simples}</div>
        </div>`;
      marker.bindPopup(popupHtml);
      marker.bindTooltip(tooltipHtml, { direction: "top", offset: [0, -20], opacity: 0.95 } as any);
      marker.addTo(markersRef.current!);
    });
  }, [filtrados]);

  const locaisCriticos = useMemo(() => {
    const map: Record<string, { count: number; ponto: Ponto }> = {};
    pontos.forEach(p => { const chave = `${p.municipio} - ${p.rua}`; if (!map[chave]) map[chave] = { count: 0, ponto: p }; map[chave].count += p.qtd; });
    return Object.entries(map).sort((a,b) => b[1].count - a[1].count).slice(0,5);
  }, [pontos]);

  async function handleEnviar(e: React.FormEvent) {
    e.preventDefault();
    if (!formRua || !formBairro) { alert("Preencha bairro e rua"); return; }
    const coords = COORDS[formMunicipio] || [-23.4342, -45.0835];
    const lat = coords[0] + (Math.random()-0.5)*0.02;
    const lng = coords[1] + (Math.random()-0.5)*0.02;
    try {
      await addDoc(collection(db, "ocorrencias"), {
        lat, lng, municipio: formMunicipio, bairro: formBairro, rua: formRua,
        tipoIdx: formTipoIdx, qtd: 1, statusRua: formStatus,
        foto: formFoto, obs: formObs, quando: new Date().toLocaleString("pt-BR"), createdAt: serverTimestamp()
      });
      alert("✅ Enviado!");
      setFormBairro(""); setFormRua(""); setFormObs(""); setFormFoto(null);
    } catch (err: any) { alert("Erro: "+err.message); }
  }

  function handleFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader(); reader.onload = () => setFormFoto(reader.result as string); reader.readAsDataURL(file);
  }

  async function excluirOcorrencia(p: Ponto) {
    if (!confirm(`Excluir ${p.municipio} - ${p.rua}?`)) return;
    try {
      if (!String(p.id).startsWith("inicial-")) await deleteDoc(doc(db, "ocorrencias", String(p.id)));
      else setPontos(ps => ps.filter(x => String(x.id) !== String(p.id)));
    } catch (e: any) { alert("Erro: "+e.message); }
  }

  return (
    <div className={`${fonteGrande ? "text-[18px]" : ""} ${altoContraste ? "bg-black text-yellow-300" : "bg-[#f8fafc] text-slate-900"} min-h-screen font-sans pb-[80px] md:pb-0`}>
      
      <div className="bg-red-600 text-white font-bold overflow-hidden relative" style={{ height: '32px' }}>
        <style>{`@keyframes marquee { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } } .animate-marquee { animation: marquee 30s linear infinite; white-space: nowrap; display:flex; gap:2rem; align-items:center; height:32px; }`}</style>
        <div className="animate-marquee text-[12px]">
          {[...noticiasOficiais, ...noticiasOficiais].map((n,i)=>(
            <span key={i} className="flex items-center gap-2"><span className={`${n.cor} px-2 py-0.5 rounded-full text-[10px]`}>{n.fonte}</span>{n.titulo}</span>
          ))}
        </div>
      </div>

      <header className={`${altoContraste ? "bg-black border-yellow-300 border-b" : "bg-white border-b"} sticky top-0 z-40`}>
        <div className="max-w-[1440px] mx-auto px-4 py-2 flex justify-between items-center">
          <div className="flex items-center gap-2 text-[10px] opacity-60"><span>Vale do Paraíba e Litoral Norte • 39 municípios • UNIVESP</span></div>
          <div className="flex gap-2">
            <select value={municipioFiltro} onChange={e=>setMunicipioFiltro(e.target.value)} className="border rounded-full px-3 py-1 text-[12px] bg-white text-black">
              <option>Todos - 39 ({pontos.length})</option>
              {MUNICIPIOS_RMVALE.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
            <button onClick={()=>{ if(navigator.geolocation) navigator.geolocation.getCurrentPosition(p=> mapRef.current?.setView([p.coords.latitude, p.coords.longitude], 14))}} className="bg-blue-600 text-white px-4 py-1 rounded-full text-[12px] font-bold">Minha localização</button>
          </div>
        </div>
        <div className="flex gap-2 px-4 pb-2">
          <button onClick={()=>setTab("usuario")} className={`px-4 py-1.5 rounded-full text-[12px] font-bold ${tab==="usuario"?"bg-black text-white":"bg-gray-100"}`}>Mapa Colaborativo</button>
          <button onClick={()=>setTab("adm")} className={`px-4 py-1.5 rounded-full text-[12px] font-bold ${tab==="adm"?"bg-black text-white":"bg-gray-100"}`}>Painel Técnico - ADM</button>
        </div>
      </header>

      {tab==="usuario" ? (
        <main className="grid md:grid-cols-[380px_1fr_360px] gap-3 p-3 max-w-[1440px] mx-auto">
          
          <section className={`${altoContraste?"bg-black border-yellow-300 border":"bg-white border"} rounded-2xl p-4 h-fit sticky top-[100px]`}>
            <h2 className="font-black text-[12px] uppercase">REGISTRAR OCORRÊNCIA - ACESSÍVEL A TODOS</h2>
            <p className="text-[11px] opacity-60 mt-1">Descreva em áudio 🎤 ou texto - seu relato vira áudio para todos</p>
            <form onSubmit={handleEnviar} className="mt-4 space-y-3">
              <select value={formMunicipio} onChange={e=>setFormMunicipio(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-[12px] bg-white text-black">
                {MUNICIPIOS_RMVALE.map(m=><option key={m}>{m}</option>)}
              </select>
              <input value={formBairro} onChange={e=>setFormBairro(e.target.value)} placeholder="Bairro (ex: Centro)" className="w-full border rounded-xl px-3 py-2 text-[12px] bg-white text-black"/>
              <input value={formRua} onChange={e=>setFormRua(e.target.value)} placeholder="Rua e número (ex: Piaui, 90)" className="w-full border rounded-xl px-3 py-2 text-[12px] bg-white text-black"/>
              <select value={formTipoIdx} onChange={e=>setFormTipoIdx(Number(e.target.value))} className="w-full border rounded-xl px-3 py-2 text-[12px] bg-white text-black font-bold">
                {TIPOS.map((t,i)=><option key={i} value={i}>{t.emoji} {t.simples} - {t.risco.toUpperCase()}</option>)}
              </select>
              <select value={formStatus} onChange={e=>setFormStatus(e.target.value as any)} className="w-full border rounded-xl px-3 py-2 text-[12px] bg-white text-black">
                <option>Alagada</option><option>Interditada</option><option>Risco</option><option>Livre</option>
              </select>
              <div className="relative">
                <textarea value={formObs} onChange={e=>setFormObs(e.target.value)} placeholder="Descreva a ocorrência..." className="w-full border rounded-xl px-3 py-2 text-[12px] min-h-[90px] bg-white text-black" />
                <button type="button" onClick={()=>{ const rec = new (window as any).webkitSpeechRecognition(); rec.lang="pt-BR"; rec.onresult=(ev:any)=>setFormObs(ev.results[0][0].transcript); rec.start(); }} className="absolute bottom-2 right-2 bg-black text-white w-8 h-8 rounded-full">🎤</button>
              </div>
              <div className="space-y-2">
                <div className="text-[11px] font-bold">Foto prova (opcional)</div>
                <div className="flex gap-2">
                  <label className="flex-1 bg-blue-600 text-white text-[11px] font-bold py-2 rounded-full text-center cursor-pointer">📷 Câmera<input type="file" accept="image/*" capture="environment" onChange={handleFoto} className="hidden"/></label>
                  <label className="flex-1 bg-gray-900 text-white text-[11px] font-bold py-2 rounded-full text-center cursor-pointer">🖼 Galeria<input type="file" accept="image/*" onChange={handleFoto} className="hidden"/></label>
                </div>
                {formFoto && <img src={formFoto} className="w-full h-32 object-cover rounded-xl border"/>}
              </div>
              <button type="submit" className="w-full bg-black text-white py-3 rounded-full font-black text-[12px]">Registrar - {formMunicipio}</button>
            </form>
            <div className="mt-6 bg-red-50 border border-red-200 rounded-xl p-3">
              <h3 className="font-black text-[11px]">🔥 LOCAIS CRÍTICOS - Histórico alta ocorrência (90d)</h3>
              <div className="mt-2 space-y-1">
                {locaisCriticos.map(([chave, {count, ponto}], i)=>(
                  <div key={chave} onClick={()=> { setViewMode("mapa"); mapRef.current?.setView([ponto.lat, ponto.lng], 15)}} className="flex justify-between items-center bg-white p-2 rounded-lg cursor-pointer hover:bg-gray-50 border">
                    <div className="text-[11px] font-bold truncate">{i+1}. {chave}</div>
                    <span className={`text-[9px] px-2 py-1 rounded-full font-black text-white ${count>6?"bg-red-600":count>2?"bg-orange-500":"bg-yellow-500"}`}>{count}x</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* MEIO DINAMICO - MAPA / FOTOS / MURAL / NOTICIAS */}
          <section className="h-[80vh] md:h-[calc(100vh-140px)] rounded-2xl overflow-hidden border relative bg-gray-100 flex flex-col">
            <div className="bg-white border-b flex flex-col items-center justify-center py-3 z-[400] shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-black text-white rounded-xl flex items-center justify-center font-black text-[14px]">GC</div>
                <div className="text-center">
                  <div className="font-black tracking-[0.25em] text-[15px] leading-none">GEOCLIMA VALE</div>
                  <div className="text-[10px] opacity-60 tracking-wide">Vale do Paraíba e Litoral Norte • 39 municípios • UNIVESP</div>
                </div>
              </div>
            </div>

            <div className="relative flex-1 overflow-auto bg-[#f8fafc]">
              {viewMode==="mapa" && (
                <>
                  <div ref={mapContainerRef} className="absolute inset-0" />
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[400] bg-black text-white px-4 py-1 rounded-full text-[11px] font-black tracking-widest shadow-lg">MAPA DE MONITORAMENTO DE OCORRÊNCIA</div>
                  <div className="absolute top-12 left-3 z-[400] bg-white/90 backdrop-blur px-3 py-1 rounded-full text-[10px] font-bold shadow">📍 {filtrados.length} ocorrências • 🔺 Hover mostra foto</div>
                  <div className="absolute bottom-[70px] md:bottom-3 left-3 z-[400] flex gap-2 text-[9px]">
                    <span className="bg-yellow-400 text-black px-2 py-1 rounded-full font-black border">🟡 ATENÇÃO</span>
                    <span className="bg-orange-500 text-white px-2 py-1 rounded-full font-black">🟠 CUIDADO</span>
                    <span className="bg-red-600 text-white px-2 py-1 rounded-full font-black">🔴 CRÍTICO</span>
                  </div>
                </>
              )}
              {viewMode==="fotos" && (
                <div className="p-4 grid grid-cols-2 gap-3 overflow-auto h-full">
                  {filtrados.map(p=>(
                    <div key={p.id} className="bg-white border rounded-2xl overflow-hidden hover:border-black cursor-pointer">
                      {p.foto ? <img src={p.foto} className="w-full h-32 object-cover"/> : <div className="w-full h-32 bg-gray-200 flex items-center justify-center">📷 Sem foto</div>}
                      <div className="p-2">
                        <div className="font-black text-[11px]">{p.municipio} - {p.rua}</div>
                        <div className="text-[10px]">{p.tipo.simples} • {p.qtd} conf</div>
                        <div className="flex gap-1 mt-2">
                          <button onClick={()=> falar(`${p.rua} ${p.tipo.simples}`)} className="flex-1 bg-black text-white py-1 rounded-full text-[9px]">🔊 Ouvir</button>
                          <button onClick={()=> compartilhar(p)} className="flex-1 bg-blue-600 text-white py-1 rounded-full text-[9px]">📤 Compartilhar</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {viewMode==="mural" && (
                <div className="p-3 space-y-4 overflow-auto h-full max-w-[500px] mx-auto">
                  {filtrados.map(p=>(
                    <div key={p.id} className="bg-white border rounded-[20px] overflow-hidden shadow-sm">
                      {p.foto && <div className="relative"><img src={p.foto} className="w-full h-[260px] object-cover"/><div className="absolute top-3 left-3 bg-black/70 text-white px-3 py-1 rounded-full text-[10px] font-bold">🎞️ {p.tipo.risco.toUpperCase()} • {p.tipo.simples}</div><div className="absolute bottom-3 right-3 bg-white/90 px-2 py-1 rounded-full text-[10px] font-black">▶️ 15s</div></div>}
                      <div className="p-3">
                        <div className="flex justify-between items-start"><div><div className="font-black text-[13px]">📍 {p.municipio} - {p.bairro}</div><div className="text-[11px] opacity-70">{p.rua} • {p.quando} • {p.qtd} confirmações</div></div><span className={`text-[9px] px-2 py-1 rounded-full font-black text-white ${p.tipo.risco==="crítico"?"bg-red-600":p.tipo.risco==="cuidado"?"bg-orange-500":"bg-yellow-500"}`}>{p.statusRua}</span></div>
                        <p className="text-[12px] mt-2">{p.obs || "Sem descrição, apenas foto prova."}</p>
                        <div className="flex gap-2 mt-3">
                          <button className="flex-1 bg-gray-900 text-white py-2 rounded-full text-[11px] font-bold">👍 Vi também ({p.qtd})</button>
                          <button onClick={()=> falar(`${p.municipio} ${p.rua} ${p.obs}`)} className="px-4 bg-black text-white py-2 rounded-full text-[11px]">🔊</button>
                          <button onClick={()=> compartilhar(p)} className="px-4 bg-blue-600 text-white py-2 rounded-full text-[11px]">📤</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {viewMode==="noticias" && (
                <div className="p-4 space-y-3 overflow-auto h-full">
                  {noticiasOficiais.map((n,i)=>(
                    <div key={i} className="bg-white border rounded-2xl p-4 flex gap-3">
                      <div className={`w-10 h-10 ${n.cor} rounded-full flex items-center justify-center text-white font-black text-[10px]`}>{n.fonte.slice(0,2)}</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2"><span className={`${n.cor} text-white px-2 py-0.5 rounded-full text-[9px] font-bold`}>{n.fonte}</span><span className="text-[10px] opacity-60">{n.time}</span></div>
                        <div className="font-black text-[13px] mt-1">{n.titulo}</div>
                        <div className="text-[11px] opacity-70 mt-1">{n.desc}</div>
                        <div className="flex gap-2 mt-3"><button className="text-[10px] bg-black text-white px-3 py-1 rounded-full">🔗 Ver no Instagram</button><button className="text-[10px] border px-3 py-1 rounded-full">📤 Compartilhar</button></div>
                      </div>
                    </div>
                  ))}
                  <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-[11px]"><b>💡 Ideia sua:</b> Aqui você pode puxar posts reais do Instagram da Defesa Civil e CEMADEN via API e mostrar aqui dentro do GeoClima.</div>
                </div>
              )}
            </div>
          </section>

          <section className="space-y-3 hidden md:block">
            <div className={`${altoContraste?"bg-black border-yellow-300 border":"bg-white border"} rounded-2xl p-3`}>
              <h3 className="font-black text-[11px]">OCORRÊNCIAS COM FOTOS - {municipioFiltro}</h3>
              <div className="mt-2 space-y-2 max-h-[60vh] overflow-auto">
                {filtrados.map(p=>(
                  <div key={p.id} onClick={()=> { setViewMode("mapa"); mapRef.current?.setView([p.lat, p.lng], 14)}} className="border rounded-2xl p-3 cursor-pointer hover:border-black bg-white">
                    <div className="flex justify-between"><div className="font-black text-[11px]">{p.municipio} - {p.rua}</div><span className={`text-[8px] px-2 py-1 rounded-full font-black h-fit ${p.statusRua==="Interditada"?"bg-red-600 text-white":p.statusRua==="Risco"?"bg-red-800 text-white":p.statusRua==="Alagada"?"bg-orange-500 text-white":"bg-gray-100"}`}>{p.statusRua}</span></div>
                    {p.foto && <img src={p.foto} className="w-full h-24 object-cover rounded-xl mt-2"/>}
                    <div className="text-[10px] mt-1">{p.tipo.simples} • {p.qtd} conf • <span className={`${p.tipo.risco==="crítico"?"text-red-600":p.tipo.risco==="cuidado"?"text-orange-600":"text-yellow-600"} font-black`}>{p.tipo.risco}</span></div>
                    <div className="flex gap-1 mt-2">
                      <button onClick={(e)=>{ e.stopPropagation(); falar(`${p.municipio}, ${p.rua}, ${p.tipo.simples}, ${p.obs}`)}} className="flex-1 bg-black text-white px-3 py-1 rounded-full text-[9px]">🔊 Ouvir</button>
                      <button onClick={(e)=>{ e.stopPropagation(); compartilhar(p);}} className="flex-1 bg-blue-600 text-white px-3 py-1 rounded-full text-[9px]">📤 Compartilhar</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </main>
      ) : (
        <div className="p-4 max-w-[1440px] mx-auto space-y-4">
          <div className="bg-[#0f172a] text-white rounded-2xl p-6">
            <h2 className="font-black tracking-widest">PAINEL TÉCNICO CEMADEN - 39 MUNICÍPIOS</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
              <div className="bg-white/10 rounded-xl p-3"><div className="text-[10px]">TOTAL</div><div className="text-2xl font-black">{pontos.length}</div></div>
              <div className="bg-red-500/20 rounded-xl p-3 border border-red-500/30"><div className="text-[10px] text-red-300">CRÍTICOS 🔴</div><div className="text-2xl font-black text-red-400">{pontos.filter(p=>p.tipo.risco==="crítico").length}</div></div>
              <div className="bg-orange-500/20 rounded-xl p-3 border border-orange-500/30"><div className="text-[10px] text-orange-300">CUIDADO 🟠</div><div className="text-2xl font-black text-orange-400">{pontos.filter(p=>p.tipo.risco==="cuidado").length}</div></div>
              <div className="bg-yellow-500/20 rounded-xl p-3 border border-yellow-500/30"><div className="text-[10px] text-yellow-300">ATENÇÃO 🟡</div><div className="text-2xl font-black text-yellow-400">{pontos.filter(p=>p.tipo.risco==="atenção").length}</div></div>
              <div className="bg-white rounded-xl p-3 text-black"><div className="text-[10px] font-black">COM FOTO</div><div className="text-2xl font-black">{pontos.filter(p=>p.foto).length}</div></div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border overflow-hidden">
            <div className="overflow-auto max-h-[70vh]">
              <table className="w-full text-[11px]"><thead className="bg-gray-50 sticky top-0"><tr><th className="p-3 text-left">Local + Foto</th><th className="p-3">Tipo</th><th className="p-3">Ação</th></tr></thead><tbody>{filtrados.map(p=>(<tr key={p.id} className="border-t"><td className="p-3"><div className="font-bold">{p.municipio} • {p.bairro}</div><div>{p.rua}</div>{p.foto && <img src={p.foto} className="w-24 h-16 object-cover rounded-lg mt-1"/>}</td><td className="p-3"><span className={`text-[9px] px-2 py-1 rounded-full font-black text-white ${p.tipo.risco==="crítico"?"bg-red-600":p.tipo.risco==="cuidado"?"bg-orange-500":"bg-yellow-500"}`}>{p.tipo.risco.toUpperCase()}</span></td><td className="p-3 flex gap-1"><button onClick={()=>excluirOcorrencia(p)} className="border border-red-200 text-red-600 px-3 py-1 rounded-full text-[10px] font-bold">Excluir</button><button onClick={()=> compartilhar(p)} className="bg-blue-600 text-white px-3 py-1 rounded-full text-[10px]">📤</button></td></tr>))}</tbody></table>
            </div>
          </div>
        </div>
      )}

      {/* RODAPÉ PREMIUM - IGUAL APPS - PC E CELULAR */}
      <nav className="fixed bottom-0 left-0 right-0 z-[5000] bg-white/95 backdrop-blur border-t shadow-[0_-4px_20px_rgba(0,0,0,0.1)] md:bottom-4 md:left-1/2 md:-translate-x-1/2 md:w-auto md:rounded-full md:border md:px-2 md:py-1">
        <div className="flex justify-around md:justify-center md:gap-1 py-2 md:py-1">
          <button onClick={()=>setViewMode("mapa")} className={`flex flex-col md:flex-row items-center gap-1 px-5 md:px-5 py-1 rounded-full transition-all ${viewMode==="mapa"?"bg-black text-white":"text-gray-500"}`}><span className="text-[20px] md:text-[16px]">🗺️</span><span className="text-[10px] md:text-[11px] font-bold">Mapa</span></button>
          <button onClick={()=>setViewMode("fotos")} className={`flex flex-col md:flex-row items-center gap-1 px-5 md:px-5 py-1 rounded-full transition-all ${viewMode==="fotos"?"bg-black text-white":"text-gray-500"}`}><span className="text-[20px] md:text-[16px]">📸</span><span className="text-[10px] md:text-[11px] font-bold">Fotos</span></button>
          <button onClick={()=>setViewMode("mural")} className={`flex flex-col md:flex-row items-center gap-1 px-5 md:px-5 py-1 rounded-full transition-all ${viewMode==="mural"?"bg-black text-white":"text-gray-500"}`}><span className="text-[20px] md:text-[16px]">🎞️</span><span className="text-[10px] md:text-[11px] font-bold">Mural</span></button>
          <button onClick={()=>setViewMode("noticias")} className={`flex flex-col md:flex-row items-center gap-1 px-5 md:px-5 py-1 rounded-full transition-all ${viewMode==="noticias"?"bg-black text-white":"text-gray-500"}`}><span className="text-[20px] md:text-[16px]">📰</span><span className="text-[10px] md:text-[11px] font-bold">Notícias</span></button>
        </div>
      </nav>

      <button onClick={()=>setShowAcess(!showAcess)} className="fixed bottom-[90px] md:bottom-5 right-5 z-[6000] w-14 h-14 bg-[#0a3d9c] text-white rounded-full shadow-xl flex flex-col items-center justify-center border-2 border-white">
        <span className="text-[20px]">♿</span><span className="text-[10px]">🤟</span>
      </button>
      {showAcess && (
        <div className="fixed inset-0 z-[9998] bg-black/30 backdrop-blur-sm flex justify-end">
          <div className={`${altoContraste?"bg-black text-yellow-300 border-yellow-300":"bg-[#f5f5f5]"} w-[92%] max-w-[380px] h-full ml-auto overflow-auto shadow-2xl border-l`}>
            <div className={`${altoContraste?"bg-black border-yellow-300":"bg-white"} sticky top-0 z-10 p-4 flex justify-between items-center border-b`}>
              <div className="flex items-center gap-2"><span className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-white">🤟</span><div><div className="font-black text-[14px]">Acessibilidade</div><div className="text-[10px] opacity-60">VLibras + Voz + Contraste</div></div></div>
              <button onClick={()=>setShowAcess(false)} className="w-8 h-8 rounded-full bg-gray-100 text-black">✕</button>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3">
              <button onClick={()=>setFonteGrande(!fonteGrande)} className={`${fonteGrande?"bg-black text-white":"bg-white text-black"} border p-4 rounded-2xl text-left shadow-sm`}><div className="text-2xl font-black">A+</div><div className="text-[12px] font-bold">Aumentar fonte</div></button>
              <button onClick={()=>setAltoContraste(!altoContraste)} className={`${altoContraste?"bg-yellow-300 text-black border-black":"bg-white text-black"} border p-4 rounded-2xl text-left shadow-sm`}><div>◐</div><div className="text-[12px] font-bold">Alto contraste</div></button>
              <button onClick={()=> falar("Leitor de tela ativado.")} className={`${leitorAtivo?"bg-blue-600 text-white":"bg-white text-black"} border p-4 rounded-2xl text-left shadow-sm`}><div>🗣</div><div className="text-[12px] font-bold">Leitor</div></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
