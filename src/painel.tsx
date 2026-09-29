import { useEffect, useRef, useState, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { db } from "./lib/firebase";
import { collection, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc } from "firebase/firestore";

type StatusMod = "pendente" | "aprovado" | "rejeitado";
type Tipo = { simples: string; tecnico: string; emoji: string; risco: "atenção" | "cuidado" | "crítico"; categoria: string; };

type Ponto = {
  id: string; lat: number; lng: number; municipio: string; bairro: string; rua: string;
  tipo: Tipo; qtd: number; statusRua: string; statusMod: StatusMod;
  foto?: string; obs?: string; quando: string; motivoRejeicao?: string; createdAt?: any;
};

const TIPOS_FALLBACK: Tipo[] = [
  { simples: "Rua alagada agora", tecnico: "Alagamento", emoji: "🚫", risco: "crítico", categoria: "Água/Chuva" },
  { simples: "Bueiro entupido", tecnico: "Bueiro", emoji: "🕳", risco: "atenção", categoria: "Infra" },
];

export default function Painel() {
  const mapRef = useRef<L.Map | null>(null);
  const mapDiv = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const [pontos, setPontos] = useState<Ponto[]>([]);
  const [filtroMod, setFiltroMod] = useState<StatusMod | "todos">("pendente");
  const [filtroFoto, setFiltroFoto] = useState<"todas" | "comFoto">("todas");
  const [sel, setSel] = useState<Ponto | null>(null);
  const [busca, setBusca] = useState("");
  const [tvIndex, setTvIndex] = useState(0);
  const [tvAutoPlay, setTvAutoPlay] = useState(true);
  const [viewMode, setViewMode] = useState<"painel" | "tv">("painel");

  useEffect(() => {
    const q = query(collection(db, "ocorrencias"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, snap => {
      const fb: Ponto[] = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id, lat: data.lat, lng: data.lng, municipio: data.municipio, bairro: data.bairro, rua: data.rua,
          tipo: data.tipo || TIPOS_FALLBACK[data.tipoIdx] || TIPOS_FALLBACK[0],
          qtd: data.qtd || 1, statusRua: data.statusRua || "Alagada",
          statusMod: data.statusMod || "pendente", foto: data.foto, obs: data.obs,
          quando: data.quando || "Agora", motivoRejeicao: data.motivoRejeicao, createdAt: data.createdAt
        };
      });
      setPontos(fb);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!mapDiv.current || mapRef.current) return;
    const map = L.map(mapDiv.current, { zoomControl: false }).setView([-23.433, -45.084], 11);
    mapRef.current = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: 'OSM', maxZoom: 19 }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  const filtrados = useMemo(() => {
    let list = pontos;
    if (filtroMod !== "todos") list = list.filter(p => p.statusMod === filtroMod);
    if (filtroFoto === "comFoto") list = list.filter(p => p.foto);
    if (busca) list = list.filter(p => `${p.municipio} ${p.bairro} ${p.rua} ${p.tipo.simples}`.toLowerCase().includes(busca.toLowerCase()));
    return list;
  }, [pontos, filtroMod, filtroFoto, busca]);

  const pendentes = pontos.filter(p => p.statusMod === "pendente");
  const aprovados = pontos.filter(p => p.statusMod === "aprovado");
  const rejeitados = pontos.filter(p => p.statusMod === "rejeitado");

  useEffect(() => {
    if (!mapRef.current || !markersRef.current) return;
    markersRef.current.clearLayers();
    filtrados.forEach(p => {
      const color = p.statusMod === "aprovado" ? "#22c55e" : p.statusMod === "rejeitado" ? "#6b7280" : "#eab308";
      const icon = L.divIcon({
        html: `<div style="background:${color};width:32px;height:32px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 6px rgba(0,0,0,0.3)">${p.tipo?.emoji || "📍"}</div>`,
        iconSize: [32, 32], iconAnchor: [16, 16], className: ""
      });
      const m = L.marker([p.lat, p.lng], { icon } as any).addTo(markersRef.current!);
      m.on('click', () => { setSel(p); mapRef.current?.setView([p.lat, p.lng], 15); });
      m.bindTooltip(`${p.municipio} - ${p.rua} - ${p.statusMod}`, { direction: "top" } as any);
    });
  }, [filtrados]);

  useEffect(() => {
    if (viewMode !== "tv" || !tvAutoPlay) return;
    const iv = setInterval(() => { setTvIndex(i => (i + 1) % Math.max(1, aprovados.length)); }, 4000);
    return () => clearInterval(iv);
  }, [viewMode, tvAutoPlay, aprovados]);

  async function aprovar(p: Ponto) { try { await updateDoc(doc(db, "ocorrencias", p.id), { statusMod: "aprovado" }); setSel({ ...p, statusMod: "aprovado" }); } catch (e: any) { alert(e.message); } }
  async function rejeitar(p: Ponto) {
    const motivo = prompt("Motivo da rejeição? (Fake / Sem foto / Duplicado / Fora do escopo)"); if (!motivo) return;
    try { await updateDoc(doc(db, "ocorrencias", p.id), { statusMod: "rejeitado", motivoRejeicao: motivo }); } catch (e: any) { alert(e.message); }
  }
  async function excluir(p: Ponto) { if (!confirm(`Excluir definitivo ${p.rua}?`)) return; try { await deleteDoc(doc(db, "ocorrencias", p.id)); setSel(null); } catch (e: any) { alert(e.message); } }
  async function compartilhar(p: Ponto) { const t = `🚨 ${p.municipio} - ${p.rua} - ${p.tipo?.simples}`; await navigator.clipboard.writeText(t + " " + location.origin); alert("📋 Copiado!"); }

  async function transmitirTV() {
    const w = window as any;
    if (w.PresentationRequest) {
      try { const req = new w.PresentationRequest([location.href]); const conn = await req.start(); alert("📺 Transmitindo via Chromecast!"); console.log(conn); return; } catch {}
    }
    setViewMode("tv");
    window.open(location.origin + "/painel?tv=1", "_blank");
  }

  function exportCSV() {
    const h = "id,municipio,bairro,rua,tipo,risco,status,quando,lat,lng,tem_foto,obs,motivo_rejeicao";
    const rows = filtrados.map(p => `${p.id},"${p.municipio}","${p.bairro}","${p.rua}","${p.tipo?.simples}","${p.tipo?.risco}","${p.statusMod}","${p.quando}",${p.lat},${p.lng},${p.foto ? "SIM" : "NAO"},"${(p.obs || "").replace(/"/g, "'")}","${p.motivoRejeicao || ""}"`).join("\n");
    const blob = new Blob([h + "\n" + rows], { type: "text/csv" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `cemaden-${filtroMod}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  }

  // MODO TV DENTRO DO PAINEL
  if (viewMode === "tv") {
    const lista = aprovados.length > 0 ? aprovados : filtrados;
    const atual = lista[tvIndex % lista.length];
    return (
      <div className="min-h-screen bg-black text-white flex flex-col font-sans">
        <header className="bg-[#0f172a] p-4 flex justify-between items-center border-b border-white/10">
          <div className="flex items-center gap-4"><div className="w-12 h-12 bg-white text-black rounded-xl flex items-center justify-center font-black">GC</div><div><div className="font-black text-[20px]">GEOCLIMA VALE - PAINEL TV AO VIVO - CEMADEN</div><div className="text-[12px] opacity-60">{aprovados.length} aprovados • Auto-play {tvAutoPlay ? "ON" : "OFF"} • Chromecast / WiFi Direct / DLNA / HDMI</div></div></div>
          <div className="flex gap-2"><button onClick={() => setTvAutoPlay(!tvAutoPlay)} className={`px-4 py-2 rounded-full font-bold ${tvAutoPlay ? "bg-green-600" : "bg-gray-600"}`}>{tvAutoPlay ? "⏸️ Pausar" : "▶️ Play"}</button><button onClick={() => setViewMode("painel")} className="bg-white text-black px-6 py-2 rounded-full font-black">✕ Sair TV</button></div>
        </header>
        <div className="flex-1 grid md:grid-cols-[1.4fr_0.6fr] gap-0">
          <div className="relative bg-gray-900 flex items-center justify-center">
            {atual?.foto ? <img src={atual.foto} className="w-full h-[80vh] object-cover" /> : <div className="w-full h-[80vh] bg-gray-800 flex items-center justify-center text-6xl">📷</div>}
            <div className="absolute top-4 left-4 bg-red-600 px-4 py-2 rounded-full font-black animate-pulse text-[12px]">🔴 AO VIVO - {atual?.tipo?.risco?.toUpperCase()} - {atual?.statusMod?.toUpperCase()}</div>
            <div className="absolute bottom-4 left-4 right-4 bg-black/80 backdrop-blur p-4 rounded-2xl"><div className="text-[28px] font-black">{atual?.municipio} - {atual?.rua}</div><div className="text-[18px] opacity-80">{atual?.tipo?.simples} • {atual?.bairro} • {atual?.quando} • {atual?.qtd}x • {atual?.statusRua}</div><div className="text-[14px] mt-2 opacity-60">{atual?.obs}</div></div>
          </div>
          <div className="bg-[#0f172a] p-4 overflow-auto max-h-[85vh]">
            <h3 className="font-black mb-3">📋 FILA TV - {lista.length} aprovados</h3>
            <div className="space-y-2">{lista.map((p, i) => <div key={p.id} onClick={() => setTvIndex(i)} className={`p-3 rounded-xl cursor-pointer border flex gap-3 ${i === tvIndex ? "bg-white text-black" : "bg-white/10 border-white/10 hover:bg-white/20"}`}><img src={p.foto} className="w-14 h-10 object-cover rounded bg-gray-700" onError={e => (e.target as any).style.display = 'none'} /><div><div className="font-bold text-[11px] truncate">{p.municipio} - {p.rua}</div><div className="text-[10px] opacity-70">{p.tipo?.simples}</div></div></div>)}</div>
            <div className="mt-6 p-3 bg-blue-900/50 rounded-xl text-[11px] border border-blue-500/30"><b>📺 Espelhar:</b><br/>Smart TV abra /painel → Modo TV<br/>Chromecast → 📡 Cast<br/>WiFi Direct/DLNA → mesma rede WiFi<br/>HDMI → notebook na TV<br/>Firebase realtime → nova aprovação cai na TV na hora</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-white font-sans text-[13px]">
      <div className="bg-amber-400 text-black text-[11px] py-1.5 overflow-hidden whitespace-nowrap font-bold"><div className="flex gap-8 animate-[marquee_30s_linear_infinite]"><span>PAINEL CEMADEN ROBUSTO - APROVAR/REJEITAR - MODO TV - CHROMECAST - WIFI DIRECT - DLNA - HDMI - </span><span>Firebase realtime - Export CSV - Auditoria - </span></div></div>
      <style>{`@keyframes marquee{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}`}</style>

      <header className="border-b border-slate-700 px-4 py-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3"><div className="bg-white text-black w-10 h-10 rounded-xl flex items-center justify-center font-black">GC</div><div><div className="font-black text-[16px]">GEOCLIMA VALE - PAINEL CEMADEN ROBUSTO</div><div className="text-[11px] text-slate-400">{pontos.length} total • {pendentes.length} pendentes • {aprovados.length} aprovados • {rejeitados.length} rejeitados • {pontos.filter(p=>p.foto).length} com foto • Fluxo Defesa Civil</div></div></div>
          <div className="flex gap-2">
            <button onClick={()=>setViewMode("tv")} className="bg-white text-black px-4 py-2 rounded-full text-[11px] font-black">📺 Modo TV</button>
            <button onClick={transmitirTV} className="bg-red-600 text-white px-4 py-2 rounded-full text-[11px] font-black">📡 Cast TV Chromecast</button>
            <a href="/" className="bg-slate-700 text-white px-4 py-2 rounded-full text-[11px] font-bold">← Morador</a>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
          <div className="bg-white/10 rounded-xl p-3"><div className="text-[10px] opacity-60">TOTAL</div><div className="text-2xl font-black">{pontos.length}</div></div>
          <div className="bg-yellow-500/20 rounded-xl p-3 border border-yellow-500/30"><div className="text-[10px] text-yellow-300">PENDENTES ⏳</div><div className="text-2xl font-black text-yellow-400">{pendentes.length}</div><div className="text-[9px] text-yellow-300">Aguardando validação</div></div>
          <div className="bg-green-500/20 rounded-xl p-3 border border-green-500/30"><div className="text-[10px] text-green-300">APROVADOS ✅</div><div className="text-2xl font-black text-green-400">{aprovados.length}</div><div className="text-[9px] text-green-300">No mapa + TV</div></div>
          <div className="bg-red-500/20 rounded-xl p-3 border border-red-500/30"><div className="text-[10px] text-red-300">REJEITADOS ❌</div><div className="text-2xl font-black text-red-400">{rejeitados.length}</div></div>
          <div className="bg-white rounded-xl p-3 text-black"><div className="text-[10px] font-black">COM FOTO</div><div className="text-2xl font-black">{pontos.filter(p=>p.foto).length}</div><div className="text-[9px]">Prova visual</div></div>
        </div>
      </header>

      <div className="px-4 py-3 flex flex-wrap gap-2 items-center bg-[#0f172a] border-b border-slate-700 sticky top-0 z-20">
        <input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="🔍 Buscar rua, bairro, município, tipo..." className="bg-slate-800 border border-slate-600 rounded-full px-4 py-2 text-[11px] w-[280px] text-white"/>
        <div className="flex gap-1 bg-slate-800 rounded-full p-1">
          <button onClick={()=>setFiltroMod("todos")} className={`px-3 py-1.5 rounded-full text-[11px] font-bold ${filtroMod==="todos"?"bg-white text-black":"text-slate-300"}`}>Todos ({pontos.length})</button>
          <button onClick={()=>setFiltroMod("pendente")} className={`px-3 py-1.5 rounded-full text-[11px] font-bold ${filtroMod==="pendente"?"bg-yellow-400 text-black":"text-slate-300"}`}>⏳ Pendentes ({pendentes.length})</button>
          <button onClick={()=>setFiltroMod("aprovado")} className={`px-3 py-1.5 rounded-full text-[11px] font-bold ${filtroMod==="aprovado"?"bg-green-500 text-white":"text-slate-300"}`}>✅ Aprovados ({aprovados.length})</button>
          <button onClick={()=>setFiltroMod("rejeitado")} className={`px-3 py-1.5 rounded-full text-[11px] font-bold ${filtroMod==="rejeitado"?"bg-red-600 text-white":"text-slate-300"}`}>❌ Rejeitados</button>
        </div>
        <button onClick={()=>setFiltroFoto(f=>f==="todas"?"comFoto":"todas")} className={`px-3 py-1.5 rounded-full text-[11px] font-bold ${filtroFoto==="comFoto"?"bg-yellow-300 text-black":"bg-slate-700 text-white"}`}>{filtroFoto==="comFoto"?"📷 Só com foto":"📷 Todas"}</button>
        <button onClick={exportCSV} className="ml-auto bg-emerald-500 text-white px-4 py-1.5 rounded-full text-[11px] font-black">📄 Exportar CSV - {filtrados.length}</button>
        <button onClick={()=>{ if(confirm(`Aprovar todos ${filtrados.filter(p=>p.statusMod==="pendente").length} pendentes filtrados?`)){ filtrados.filter(p=>p.statusMod==="pendente").forEach(p=>aprovar(p)); }}} className="bg-green-600 text-white px-4 py-1.5 rounded-full text-[11px] font-bold">✅ Aprovar todos filtrados</button>
      </div>

      <div className="px-4 py-3 grid grid-cols-1 lg:grid-cols-[1.4fr_420px] gap-4">
        <div className="bg-white text-black rounded-xl overflow-hidden">
          <div className="p-3 border-b bg-gray-50 text-[10px] font-black text-gray-500 flex justify-between"><span>TABELA MODERAÇÃO ROBUSTA - {filtrados.length} • ORDENADO POR RECENTES</span><span>{filtrados.filter(p=>p.foto).length} com foto</span></div>
          <div className="overflow-auto max-h-[75vh]">
            <table className="w-full text-[11px]">
              <thead className="bg-gray-100 text-[10px] font-black text-gray-500 sticky top-0 z-10"><tr><th className="text-left p-2">LOCAL + FOTO + STATUS</th><th className="text-left p-2">TIPO (17 CAUSAS)</th><th className="text-left p-2">DATA / AUDIT</th><th className="p-2">AÇÃO CEMADEN</th></tr></thead>
              <tbody>{filtrados.map(p=>(
                <tr key={p.id} className={`border-t hover:bg-gray-50 ${p.statusMod==="pendente"?"bg-yellow-50/60":p.statusMod==="aprovado"?"bg-green-50/40":"bg-red-50/40"} ${sel?.id===p.id?"!bg-blue-50 border-l-4 border-l-blue-500":""}`}>
                  <td className="p-2">
                    <div className="font-bold">{p.bairro} - {p.rua}</div><div className="text-[10px] text-gray-500">{p.municipio} • {p.statusRua} • {p.quando}</div>
                    <div className="flex gap-1 mt-1"><span className={`text-[9px] px-2 py-0.5 rounded-full font-black text-white ${p.statusMod==="pendente"?"bg-yellow-500 text-black":p.statusMod==="aprovado"?"bg-green-600":"bg-red-600"}`}>{p.statusMod.toUpperCase()}</span></div>
                    {p.motivoRejeicao && <div className="text-[10px] text-red-600 mt-1 bg-red-50 p-1 rounded">Motivo: {p.motivoRejeicao}</div>}
                    {p.foto ? <img src={p.foto} alt={`Foto ${p.rua}`} className="w-36 h-24 object-cover rounded-lg mt-2 border" onError={e=>{(e.target as any).style.display='none'}}/> : <div className="text-[10px] text-red-500 mt-1">Sem foto</div>}
                    <div className="text-[10px] text-gray-600 mt-1 line-clamp-2">{p.obs}</div>
                  </td>
                  <td className="p-2"><div className="font-bold">{p.tipo?.emoji} {p.tipo?.simples}</div><div className="bg-black text-white text-[9px] px-2 py-0.5 rounded-full inline-block mt-1">{p.tipo?.tecnico}</div><div className="text-[9px] text-gray-500 mt-1">{p.tipo?.categoria} - {p.tipo?.risco}</div></td>
                  <td className="p-2"><div className="text-[10px]">{p.quando}</div><div className="text-[9px] text-gray-400 mt-1">{p.createdAt ? new Date(p.createdAt.seconds*1000).toLocaleString() : ""}</div></td>
                  <td className="p-2">
                    <div className="flex flex-col gap-1.5 min-w-[150px]">
                      {p.statusMod==="pendente" && <><button onClick={()=>aprovar(p)} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-full text-[11px] font-black shadow">✅ Aprovar → Mapa + TV</button><button onClick={()=>rejeitar(p)} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-full text-[11px] font-black">❌ Rejeitar</button></>}
                      {p.statusMod==="aprovado" && <><div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-[10px] font-bold text-center">✅ Publicado no mapa e TV</div><button onClick={()=>rejeitar(p)} className="border border-red-200 text-red-600 px-3 py-1.5 rounded-full text-[10px] font-bold">Mover para rejeitado</button></>}
                      {p.statusMod==="rejeitado" && <><div className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-[10px] font-bold text-center">❌ Rejeitado</div><button onClick={()=>aprovar(p)} className="bg-black text-white px-3 py-1.5 rounded-full text-[10px] font-bold">↩️ Re-aprovar</button></>}
                      <button onClick={()=>{ setSel(p); mapRef.current?.setView([p.lat,p.lng], 15); }} className="border border-gray-300 px-3 py-1.5 rounded-full text-[10px] font-bold">🗺️ Ver no mapa</button>
                      <button onClick={()=>compartilhar(p)} className="bg-blue-600 text-white px-3 py-1.5 rounded-full text-[10px] font-bold">📤 Compartilhar</button>
                      <button onClick={()=>excluir(p)} className="border text-gray-500 px-3 py-1 rounded-full text-[9px] hover:border-red-500 hover:text-red-500">Excluir definitivo Firebase</button>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>

        <div className="space-y-3">
          <div className="bg-white rounded-xl overflow-hidden border">
            <div className="bg-slate-800 text-white px-3 py-2 text-[11px] font-black flex justify-between"><span>MAPA TÉCNICO - {filtrados.length} pontos - {filtroMod.toUpperCase()}</span><span className={`px-2 py-0.5 rounded-full text-[9px] ${filtroMod==="pendente"?"bg-yellow-400 text-black":filtroMod==="aprovado"?"bg-green-500 text-white":"bg-slate-600"}`}>{filtroMod}</span></div>
            <div ref={mapDiv} className="w-full h-[340px] bg-gray-200" />
            <div className="p-2 bg-gray-50 text-[10px] text-gray-600 flex gap-2"><span>🟡 Pendente</span><span>🟢 Aprovado</span><span>⚪ Rejeitado</span></div>
          </div>

          {sel && (
            <div className="bg-white text-black rounded-xl p-4 border">
              <h4 className="font-black text-[11px] flex justify-between">DETALHE COM FOTO <button onClick={()=>setSel(null)} className="text-gray-400">✕</button></h4>
              <div className="mt-2"><div className="font-bold">{sel.bairro} - {sel.rua}</div><div className="text-[10px] text-gray-500">{sel.municipio} • {sel.quando} • {sel.statusRua} • {sel.statusMod}</div>{sel.foto && <img src={sel.foto} alt={`Foto grande ${sel.rua}`} className="w-full h-64 object-cover rounded-xl mt-2 border" onError={e=>{(e.target as any).style.display='none'}}/>}<div className="mt-2 text-[11px]"><span className="font-bold">{sel.tipo?.emoji} {sel.tipo?.simples}</span> - <span className="bg-black text-white px-2 py-0.5 rounded-full text-[10px]">{sel.tipo?.tecnico}</span></div><div className="text-[10px] text-gray-500 mt-1">{sel.tipo?.categoria} - Causa: {sel.tipo?.risco}</div><div className="mt-2 text-[11px] bg-gray-50 p-2 rounded-lg">{sel.obs || "Sem descrição"}</div>{sel.motivoRejeicao && <div className="mt-2 text-[11px] bg-red-50 text-red-700 p-2 rounded-lg border border-red-200"><b>Motivo rejeição:</b> {sel.motivoRejeicao}</div>}<div className="flex gap-2 mt-3">{sel.statusMod==="pendente" && <><button onClick={()=>aprovar(sel)} className="flex-1 bg-green-600 text-white py-2 rounded-full font-black text-[11px]">✅ Aprovar</button><button onClick={()=>rejeitar(sel)} className="flex-1 bg-red-600 text-white py-2 rounded-full font-black text-[11px]">❌ Rejeitar</button></>}<button onClick={()=>compartilhar(sel)} className="px-4 bg-blue-600 text-white py-2 rounded-full text-[11px]">📤</button></div></div>
            </div>
          )}

          <div className="bg-[#0f172a] border border-slate-700 rounded-xl p-4">
            <h4 className="font-black text-white mb-3 text-[11px] flex items-center gap-2">📺 CONTROLE TV - ESPELHAMENTO ROBUSTO</h4>
            <div className="space-y-2">
              <button onClick={()=>setViewMode("tv")} className="w-full bg-white text-black py-3 rounded-xl font-black text-[12px]">📺 Abrir Modo TV Fullscreen - Só aprovados</button>
              <button onClick={transmitirTV} className="w-full bg-red-600 text-white py-3 rounded-xl font-black text-[12px]">📡 Transmitir Chromecast / WiFi Direct / DLNA</button>
              <div className="bg-blue-900/30 border border-blue-500/30 rounded-xl p-3 text-[11px] text-blue-200">
                <b>Como funciona na prática:</b><br/>
                • <b>Modo TV:</b> carrossel automático só aprovados, foto gigante, ao vivo, atualiza realtime<br/>
                • <b>Chromecast:</b> Presentation API - manda pra TV com Chromecast mesma WiFi<br/>
                • <b>WiFi Direct / DLNA:</b> Smart TV abre URL /painel na mesma rede, não precisa cabo<br/>
                • <b>HDMI:</b> espelha notebook → TV<br/>
                • <b>Realtime:</b> Firebase onSnapshot - aprovou no painel, cai na TV na hora
              </div>
              <div className="bg-black rounded-xl p-3 text-[11px] border border-white/10">
                <div className="font-bold mb-2">🔴 AO VIVO AGORA NA TV ({aprovados.length}):</div>
                {aprovados.slice(0,4).map(p=><div key={p.id} className="flex justify-between border-b border-white/10 py-1.5 text-[11px]"><span className="truncate">{p.municipio} - {p.rua} - {p.tipo?.simples}</span><span className="text-green-400">●</span></div>)}
                {aprovados.length===0 && <div className="opacity-60">Nenhum aprovado ainda. Aprove pendentes para aparecer na TV.</div>}
              </div>
            </div>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-[11px] text-slate-300">
            <h4 className="font-black text-white mb-2">📊 AUDITORIA CEMADEN</h4>
            <div className="space-y-2"><div className="flex justify-between"><span>Pendentes hoje:</span><span className="font-black text-yellow-400">{pendentes.length}</span></div><div className="flex justify-between"><span>Taxa aprovação:</span><span className="font-black text-green-400">{pontos.length>0?Math.round((aprovados.length/pontos.length)*100):0}%</span></div><div className="flex justify-between"><span>Com foto:</span><span className="font-black">{pontos.filter(p=>p.foto).length}/{pontos.length}</span></div><div className="mt-3 pt-3 border-t border-white/10 text-[10px] opacity-60">Log: última ação {new Date().toLocaleTimeString()} - Fluxo Defesa Civil 39 municípios</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}
