import { useEffect, useRef, useState, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { db } from "./lib/firebase";
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from "firebase/firestore";

type Tab = "usuario" | "adm";
type Categoria = "Água/Chuva" | "Terra/Encosta" | "Vento/Tempo" | "Infra Urbana";
type Tipo = { simples: string; tecnico: string; emoji: string; categoria: Categoria; risco: string; };

const MUNICIPIOS_RMVALE = [
  "Aparecida","Arapeí","Areias","Bananal","Caçapava","Cachoeira Paulista","Canas","Caraguatatuba","Cruzeiro","Cunha","Guaratinguetá","Igaratá","Ilhabela","Jacareí","Jambeiro","Lagoinha","Lavrinhas","Lorena","Monteiro Lobato","Natividade da Serra","Paraibuna","Pindamonhangaba","Piquete","Potim","Queluz","Redenção da Serra","Roseira","Santa Branca","Santo Antônio do Pinhal","São Bento do Sapucaí","São José do Barreiro","São José dos Campos","São Luiz do Paraitinga","São Sebastião","Silveiras","Taubaté","Tremembé","Ubatuba"
].sort();

const COORDS: Record<string, [number, number]> = {
  "Ubatuba": [-23.4342,-45.0835], "Caraguatatuba": [-23.62,-45.4125], "Ilhabela": [-23.7781,-45.3581], "São Sebastião": [-23.76,-45.4097],
  "São José dos Campos": [-23.1791,-45.8869], "Taubaté": [-23.0257,-45.5558], "Jacareí": [-23.305,-45.966], "Pindamonhangaba": [-22.9236,-45.4617],
  "Guaratinguetá": [-22.81,-45.1928], "Lorena": [-22.7328,-45.1269], "Cruzeiro": [-22.5733,-44.9639],
};

const TIPOS: Tipo[] = [
  { simples: "Rua alagada agora", tecnico: "Alagamento", emoji: "🚫", categoria: "Água/Chuva", risco: "Chuva intensa + maré alta" },
  { simples: "Enxurrada forte", tecnico: "Enxurrada", emoji: "🌊", categoria: "Água/Chuva", risco: "Chuva >30mm/h" },
  { simples: "Rio transbordou", tecnico: "Inundação fluvial", emoji: "🏞️", categoria: "Água/Chuva", risco: "Chuva 72h" },
  { simples: "Mar avançou / ressaca", tecnico: "Ressaca", emoji: "🌊", categoria: "Água/Chuva", risco: "Maré alta + ressaca" },
  { simples: "Bueiro entupido", tecnico: "Bueiro obstruido", emoji: "🕳️", categoria: "Infra Urbana", risco: "Falta manutenção" },
  { simples: "Rua que sempre alaga", tecnico: "Galeria subdimensionada", emoji: "💧", categoria: "Infra Urbana", risco: "Drenagem insuficiente" },
  { simples: "Barro desceu", tecnico: "Deslizamento", emoji: "⛰️", categoria: "Terra/Encosta", risco: "Chuva + solo encharcado" },
  { simples: "Barranco rachou", tecnico: "Risco deslizamento", emoji: "⚠️", categoria: "Terra/Encosta", risco: "Infiltração" },
  { simples: "Erosão buraco", tecnico: "Erosão", emoji: "🕳️", categoria: "Terra/Encosta", risco: "Solo exposto" },
  { simples: "Muro caiu", tecnico: "Colapso contenção", emoji: "🧱", categoria: "Terra/Encosta", risco: "Saturação solo" },
  { simples: "Árvore caiu", tecnico: "Queda de árvore", emoji: "🌳", categoria: "Vento/Tempo", risco: "Vento + solo úmido" },
  { simples: "Vento destelhou", tecnico: "Vendaval", emoji: "💨", categoria: "Vento/Tempo", risco: "Rajada >60km/h" },
  { simples: "Raio caiu", tecnico: "Descarga elétrica", emoji: "⚡", categoria: "Vento/Tempo", risco: "Tempestade elétrica" },
  { simples: "Granizo", tecnico: "Granizo", emoji: "🧊", categoria: "Vento/Tempo", risco: "Cumulonimbus" },
  { simples: "Lixo entulho", tecnico: "Acúmulo resíduos", emoji: "🗑️", categoria: "Infra Urbana", risco: "Obstrução" },
  { simples: "Mato alto", tecnico: "Vegetação", emoji: "🌿", categoria: "Infra Urbana", risco: "Falta roçada" },
  { simples: "Obra atrapalhando", tecnico: "Obra irregular", emoji: "🚧", categoria: "Infra Urbana", risco: "Antrópica" },
];

type Ponto = { id: string | number; lat: number; lng: number; municipio: string; bairro: string; rua: string; tipo: Tipo; qtd: number; freq: "Alta" | "Média" | "Baixa"; statusRua: "Livre" | "Alagada" | "Interditada" | "Risco"; foto?: string; obs?: string; quando: string; };

const INICIAL: Ponto[] = [
  { id: "inicial-1", lat: -23.4342, lng: -45.0835, municipio: "Ubatuba", bairro: "Centro", rua: "Hans Staden, 345", tipo: TIPOS[0], qtd: 12, freq: "Alta", quando: "Ontem 18h", statusRua: "Interditada" },
  { id: "inicial-2", lat: -23.62, lng: -45.4125, municipio: "Caraguatatuba", bairro: "Martim de Sá", rua: "Av. da Praia, 100", tipo: TIPOS[3], qtd: 8, freq: "Alta", quando: "Hoje 06h", statusRua: "Alagada" },
  { id: "inicial-3", lat: -23.1791, lng: -45.8869, municipio: "São José dos Campos", bairro: "Vila Industrial", rua: "Rua Paraibuna, 200", tipo: TIPOS[4], qtd: 15, freq: "Alta", quando: "Hoje 07h", statusRua: "Alagada" },
];

function BarraAcessibilidade({ fontSize, setFontSize, highContrast, setHighContrast }: any) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (document.getElementById('vlibras-script')) return;
    const div = document.createElement('div');
    div.setAttribute('vw', '');
    div.className = 'enabled';
    div.innerHTML = `<div vw-access-button class="active"></div><div vw-plugin-wrapper><div class="vw-plugin-top-wrapper"></div></div>`;
    document.body.appendChild(div);
    const script = document.createElement('script');
    script.id = 'vlibras-script';
    script.src = 'https://vlibras.gov.br/app/vlibras-plugin.js';
    script.async = true;
    script.onload = () => {
      // @ts-ignore
      if ((window as any).VLibras) {
        // @ts-ignore
        new (window as any).VLibras.Widget('https://vlibras.gov.br/app');
      }
    };
    document.body.appendChild(script);
  }, []);
  return (
    <>
      <button onClick={() => setOpen(!open)} className="fixed bottom-5 right-5 z-[9999] w-14 h-14 bg-[#0a3d9c] text-white rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.3)] flex flex-col items-center justify-center border-2 border-white hover:scale-110 transition">
        <span className="text-[20px]">♿</span><span className="text-[12px]">🤟</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-[9998] bg-black/30 backdrop-blur-sm flex justify-end">
          <div className="bg-[#f5f5f5] w-[92%] max-w-[380px] h-full ml-auto overflow-auto shadow-2xl">
            <div className="bg-white sticky top-0 z-10 p-4 flex justify-between items-center border-b"><div className="flex items-center gap-2"><span className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-white">🤟</span><div><div className="font-black text-[14px]">Acessibilidade</div></div></div><button onClick={() => setOpen(false)} className="w-8 h-8 rounded-full hover:bg-gray-100">✕</button></div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setFontSize((s: number) => Math.min(150, s + 10))} className={`bg-white rounded-xl p-4 border text-left ${fontSize > 100 ? "border-orange-500 bg-orange-50" : ""}`}><div className="text-[28px] font-black">A+</div><div className="text-[12px] font-bold">Aumentar fonte</div></button>
                <button onClick={() => setFontSize(100)} className="bg-white rounded-xl p-4 border text-left"><div className="text-[24px]">A</div><div className="text-[12px] font-bold">Fonte normal</div></button>
                <button onClick={() => setHighContrast(!highContrast)} className={`bg-white rounded-xl p-4 border text-left ${highContrast ? "border-orange-500 bg-orange-50" : ""}`}><div className="text-[22px]">◐</div><div className="text-[12px] font-bold">Alto contraste</div></button>
                <button onClick={() => { const u = new SpeechSynthesisUtterance("GeoClima Vale"); u.lang="pt-BR"; speechSynthesis.speak(u); }} className="bg-white rounded-xl p-4 border text-left"><div className="text-[22px]">🗣️</div><div className="text-[12px] font-bold">Leitor</div></button>
              </div>
              <button onClick={() => { setFontSize(100); setHighContrast(false); }} className="w-full bg-[#d35400] text-white rounded-full py-3 font-bold">↺ Restaurar</button>
            </div>
          </div>
        </div>
      )}
      <style>{`[vw-access-button]{bottom:90px !important; right:20px !important;}`}</style>
    </>
  );
}

export default function App() {
  const mapRef = useRef<L.Map | null>(null);
  const mapDiv = useRef<HTMLDivElement>(null);
  const layerOcorrenciasRef = useRef<L.LayerGroup | null>(null);
  const layerPinRef = useRef<L.LayerGroup | null>(null);
  const userLocationRef = useRef<L.Marker | null>(null);
  const [tab, setTab] = useState<Tab>("usuario");
  const [pontos, setPontos] = useState<Ponto[]>(INICIAL);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [enderecoAuto, setEnderecoAuto] = useState<string>("");
  const [carregandoEndereco, setCarregandoEndereco] = useState(false);
  const [tipoSel, setTipoSel] = useState<Tipo>(TIPOS[0]);
  const [rua, setRua] = useState("");
  const [bairro, setBairro] = useState("Centro");
  const [municipio, setMunicipio] = useState("Ubatuba");
  const [municipioFiltro, setMunicipioFiltro] = useState("Todos");
  const [statusRua, setStatusRua] = useState<Ponto["statusRua"]>("Alagada");
  const [obs, setObs] = useState("");
  const [foto, setFoto] = useState<string | undefined>();
  const [filtroCat, setFiltroCat] = useState<Categoria | "Todas">("Todas");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "agora">("todos");
  const [fontSize, setFontSize] = useState(100);
  const [highContrast, setHighContrast] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<"buscando" | "ok" | "erro">("buscando");
  const [pwaInstallPrompt, setPwaInstallPrompt] = useState<any>(null);

  const noticias = useMemo(() => {
    const ultimas = pontos.slice(0,3).map(p => `${p.municipio}: ${p.rua} - ${p.statusRua}`);
    return [
      `ALERTA INMET: Chuva moderada a forte no Vale do Paraíba e Litoral Norte - 39 municípios em atenção`,
      ...ultimas,
      `DEFESA CIVIL: ${pontos.filter(p=>p.statusRua!=="Livre").length} pontos com interdição nas últimas 24h`,
    ];
  }, [pontos]);

  useEffect(() => {
    const handler = (e: any) => { e.preventDefault(); setPwaInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    if (import.meta.env.PROD && 'serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js').catch(()=>{}); }
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const instalarPWA = () => {
    if (pwaInstallPrompt) { pwaInstallPrompt.prompt(); }
    else { alert('No celular: 3 pontinhos ⋮ → Instalar app'); }
  };

  const buscarEndereco = async (lat: number, lng: number) => {
    setCarregandoEndereco(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, { headers: { 'Accept-Language': 'pt-BR' } });
      const data = await res.json();
      const addr = data.address || {};
      const ruaAuto = `${addr.road || ""} ${addr.house_number || ""}`.trim() || data.display_name?.split(',')[0] || `Ponto ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      const bairroAuto = addr.suburb || addr.neighbourhood || "";
      const municipioAuto = addr.city || addr.town || "";
      setEnderecoAuto(data.display_name || "");
      setRua(ruaAuto);
      if (bairroAuto) setBairro(bairroAuto);
      if (municipioAuto) {
        const match = MUNICIPIOS_RMVALE.find(m => municipioAuto.toLowerCase().includes(m.toLowerCase()) || m.toLowerCase().includes(municipioAuto.toLowerCase()));
        if (match) setMunicipio(match);
      }
    } catch {
      setRua(`Lat ${lat.toFixed(5)}, Lng ${lng.toFixed(5)}`);
    }
    setCarregandoEndereco(false);
  };

  useEffect(() => {
    const q = query(collection(db, "ocorrencias"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const docsFirebase: Ponto[] = snap.docs.map(d => {
        const data = d.data() as any;
        const tipoObj = TIPOS.find(t => t.tecnico === data.tipo_tecnico) || TIPOS.find(t => t.simples === data.tipo_simples) || TIPOS[0];
        return { id: d.id, lat: data.lat, lng: data.lng, municipio: data.municipio, bairro: data.bairro || "Centro", rua: data.rua, tipo: tipoObj, qtd: data.qtd || 1, freq: data.freq || "Baixa", statusRua: data.statusRua || "Alagada", foto: data.foto, obs: data.obs || "", quando: data.quando || "Agora" };
      });
      setPontos(() => {
        const idsFirebase = new Set(docsFirebase.map(d=>d.id));
        const iniciaisNaoDuplicadas = INICIAL.filter(p => !idsFirebase.has(p.id as any));
        return [...docsFirebase, ...iniciaisNaoDuplicadas];
      });
    });
    return () => unsub();
  }, []);

  const filtrados = useMemo(() => {
    let l = [...pontos];
    if (filtroCat !== "Todas") l = l.filter(p => p.tipo.categoria === filtroCat);
    if (filtroStatus === "agora") l = l.filter(p => p.statusRua !== "Livre");
    if (municipioFiltro !== "Todos") l = l.filter(p => p.municipio === municipioFiltro);
    return l;
  }, [pontos, filtroCat, filtroStatus, municipioFiltro]);

  // FIX DEFINITIVO - MAPA ÚNICO COM PROTEÇÃO CONTRA DUPLA INICIALIZAÇÃO
  useEffect(() => {
    if (!mapDiv.current) return;
    // Se já tem leaflet_id, já foi inicializado - não inicializa de novo
    if ((mapDiv.current as any)._leaflet_id) return;
    if (mapRef.current) { try { mapRef.current.remove(); } catch {} mapRef.current = null; }

    const map = L.map(mapDiv.current, { 
      zoomControl: false, 
      preferCanvas: true, 
      scrollWheelZoom: false,
      dragging: true,
      tap: true
    }).setView([-23.3, -45.5], 9.5);
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM', maxZoom: 19 }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    layerOcorrenciasRef.current = L.layerGroup().addTo(map);
    layerPinRef.current = L.layerGroup().addTo(map);

    setTimeout(() => { try { map.invalidateSize(); } catch {} }, 300);

    map.on('click', (e: any) => { 
      const c = { lat: e.latlng.lat, lng: e.latlng.lng }; 
      setCoords(c); 
      buscarEndereco(c.lat, c.lng); 
    });

    if (navigator.geolocation) {
      setGpsStatus("buscando");
      navigator.geolocation.getCurrentPosition((pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserCoords(c); setGpsStatus("ok");
        try { map.setView([c.lat, c.lng], 15); } catch {}
        const userIcon = L.divIcon({ html: `<div style="background:#4285F4;width:18px;height:18px;border-radius:50%;border:3px solid white"></div>`, iconSize: [18, 18], iconAnchor: [9, 9], className: "" });
        if (userLocationRef.current) try { map.removeLayer(userLocationRef.current); } catch {}
        userLocationRef.current = L.marker([c.lat, c.lng], { icon: userIcon } as any).addTo(map).bindPopup("Você está aqui");
        setCoords(c); buscarEndereco(c.lat, c.lng);
      }, () => setGpsStatus("erro"), { enableHighAccuracy: true });
    } else setGpsStatus("erro");

    return () => { 
      try { 
        if (mapRef.current) {
          mapRef.current.remove(); 
          mapRef.current = null;
        }
      } catch {} 
      layerOcorrenciasRef.current = null;
      layerPinRef.current = null;
    };
  }, []); // só uma vez

  const centralizarNoUsuario = () => {
    if (userCoords && mapRef.current) { 
      try { mapRef.current.setView([userCoords.lat, userCoords.lng], 16); setCoords(userCoords); buscarEndereco(userCoords.lat, userCoords.lng); } catch {} 
    } else if (navigator.geolocation) {
      setGpsStatus("buscando");
      navigator.geolocation.getCurrentPosition((pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserCoords(c); setGpsStatus("ok"); 
        try { mapRef.current?.setView([c.lat, c.lng], 16); } catch {} 
        setCoords(c); buscarEndereco(c.lat, c.lng);
      }, () => setGpsStatus("erro"));
    }
  };

  useEffect(() => {
    const lgOcorr = layerOcorrenciasRef.current;
    const lgPin = layerPinRef.current;
    const map = mapRef.current;
    if (!map || !lgOcorr || !lgPin) return;
    try {
      const cont = map.getContainer();
      if (!cont || !document.body.contains(cont)) return;
    } catch { return; }

    lgOcorr.clearLayers();
    lgPin.clearLayers();

    filtrados.forEach(p => {
      const color = p.statusRua === "Interditada" ? "#ef4444" : p.statusRua === "Risco" ? "#dc2626" : p.statusRua === "Alagada" ? "#f97316" : "#eab308";
      const icon = L.divIcon({ html: `<div style="background:${color};width:32px;height:32px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,0.3)">${p.tipo.emoji}</div>`, iconSize: [32, 32], iconAnchor: [16, 16], className: "" });
      const m = L.marker([p.lat, p.lng], { icon } as any);
      const fotoHtml = p.foto ? `<br/><img src="${p.foto}" style="width:200px;border-radius:8px;margin-top:6px"/>` : "";
      m.bindPopup(`<b>${p.municipio} - ${p.rua}</b><br/>${p.bairro} • ${p.statusRua}<br/>${p.tipo.simples}${fotoHtml}`);
      m.addTo(lgOcorr);
    });

    if (coords) {
      const pinIcon = L.divIcon({
        html: `<div style="position:relative;filter:drop-shadow(0 4px 8px rgba(37,99,235,0.5))"><div style="background:#2563eb;width:44px;height:44px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;display:flex;align-items:center;justify-content:center"><span style="transform:rotate(45deg);font-size:22px">📍</span></div><div style="position:absolute;top:-8px;left:50%;transform:translateX(-50%);background:#2563eb;color:white;font-size:8px;font-weight:900;padding:2px 6px;border-radius:10px;white-space:nowrap">NOVO LOCAL</div></div>`,
        iconSize: [44, 52], iconAnchor: [22, 48], className: "",
      });
      const pin = L.marker([coords.lat, coords.lng], { icon: pinIcon, draggable: true } as any);
      pin.on('dragend', (e: any) => { const ll = e.target.getLatLng(); const c = { lat: ll.lat, lng: ll.lng }; setCoords(c); buscarEndereco(c.lat, c.lng); });
      pin.addTo(lgPin);
    }
  }, [filtrados, coords, municipio, enderecoAuto]);

  const handleFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert("Máx 5MB"); return; }
    const reader = new FileReader(); reader.onload = () => setFoto(reader.result as string); reader.readAsDataURL(file);
  };

  const salvar = async () => {
    if (!coords) { alert("Toque no mapa para escolher o local"); return; }
    const ruaFinal = rua.trim() || enderecoAuto || `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`;
    try {
      await addDoc(collection(db, "ocorrencias"), { lat: coords.lat, lng: coords.lng, municipio, bairro, rua: ruaFinal, endereco_completo: enderecoAuto, tipo_simples: tipoSel.simples, tipo_tecnico: tipoSel.tecnico, categoria: tipoSel.categoria, emoji: tipoSel.emoji, risco: tipoSel.risco, statusRua, foto: foto || null, obs: obs || "", qtd: 1, freq: "Baixa", quando: new Date().toLocaleString("pt-BR"), createdAt: serverTimestamp() });
      setRua(""); setObs(""); setFoto(undefined); setCoords(null); setEnderecoAuto("");
      alert(`Registrado! ${municipio} - ${ruaFinal}`);
    } catch (e: any) { alert("Erro: " + e.message); }
  };

  const Formulario = () => (
    <div className="p-4 space-y-3">
      <div className={`${coords ? "bg-blue-50 border-blue-300 text-blue-900" : "bg-gray-50 border-gray-200"} border rounded-xl p-2.5 text-[11px] font-bold`}>{coords ? `Local: ${enderecoAuto ? enderecoAuto.substring(0,80) : `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`} - ${municipio}` : "Toque no mapa para escolher o local"}{carregandoEndereco && <span className="ml-2 animate-pulse">Buscando...</span>}</div>
      <div><label className="text-[10px] font-black">MUNICÍPIO (39)</label><select value={municipio} onChange={e => setMunicipio(e.target.value)} className="w-full border-2 border-black rounded-xl p-3 text-[12px] font-bold mt-1 bg-white">{MUNICIPIOS_RMVALE.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
      <div><label className="text-[10px] font-black">CATEGORIA</label><select value={filtroCat} onChange={e => setFiltroCat(e.target.value as any)} className="w-full border rounded-xl p-2.5 text-[12px] mt-1 font-bold"><option value="Todas">Todas (17 tipos)</option><option value="Água/Chuva">Água / Chuva</option><option value="Terra/Encosta">Terra / Encosta</option><option value="Vento/Tempo">Vento / Tempo</option><option value="Infra Urbana">Infra Urbana</option></select></div>
      <div><label className="text-[10px] font-black">TIPO DE OCORRÊNCIA</label><select value={tipoSel.tecnico} onChange={e => setTipoSel(TIPOS.find(t => t.tecnico === e.target.value)!)} className="w-full border-2 border-black rounded-xl p-3 text-[12px] font-bold mt-1">{TIPOS.filter(t => filtroCat === "Todas" || t.categoria === filtroCat).map(t => (<option key={t.tecnico} value={t.tecnico}>{t.emoji} {t.simples}</option>))}</select></div>
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
        <label className="text-[10px] font-black text-blue-900">ENDEREÇO AUTOMÁTICO</label>
        <input value={rua} onChange={e => setRua(e.target.value)} placeholder="Será preenchido ao tocar no mapa" className="w-full border rounded-xl p-3 text-[12px] bg-white mt-2" />
        {enderecoAuto && <div className="text-[9px] text-gray-500 mt-1 bg-white rounded-full px-2 py-1">Completo: {enderecoAuto.substring(0,100)}...</div>}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div><label className="text-[9px] font-bold">Bairro</label><input value={bairro} onChange={e => setBairro(e.target.value)} className="w-full border rounded-xl p-2.5 text-[11px] mt-1 bg-white" /></div>
          <div><label className="text-[9px] font-bold">Situação</label><select value={statusRua} onChange={e => setStatusRua(e.target.value as any)} className="w-full border rounded-xl p-2.5 text-[11px] mt-1 bg-white"><option value="Interditada">Interditada</option><option value="Alagada">Alagada</option><option value="Risco">Em risco</option><option value="Livre">Livre</option></select></div>
        </div>
      </div>
      <div><label className="text-[10px] font-bold">Foto</label><label className="mt-1 w-full border-2 border-dashed rounded-xl p-3 flex flex-col items-center justify-center cursor-pointer"><input type="file" accept="image/*" capture="environment" onChange={handleFoto} className="sr-only" />{foto ? <img src={foto} alt="Previa" className="w-full h-36 object-cover rounded-lg" /> : <><span className="text-2xl">📷</span><span className="text-[11px] font-bold">Adicionar foto</span></>}</label></div>
      <div><label className="text-[10px] font-bold">Observação</label><textarea value={obs} onChange={e => setObs(e.target.value)} placeholder="Ex: água com 30cm..." className="w-full border rounded-xl p-2.5 text-[12px] h-14 mt-1" /></div>
      <button onClick={salvar} className="w-full bg-orange-600 text-white rounded-full py-3.5 text-[13px] font-black">Registrar - {municipio}</button>
    </div>
  );

  return (
    <div className={`${highContrast ? "bg-black text-white" : "bg-[#f8f9fb] text-black"} min-h-screen font-sans`} style={{ fontSize: `${fontSize}%` }}>
      <BarraAcessibilidade fontSize={fontSize} setFontSize={setFontSize} highContrast={highContrast} setHighContrast={setHighContrast} />
      <div role="alert" className="bg-[#dc2626] text-white text-[11px] py-2 overflow-hidden whitespace-nowrap font-bold"><div className="flex gap-10 animate-[marquee_40s_linear_infinite]">{noticias.map((n,i)=><span key={i}>• {n} •</span>)}{noticias.map((n,i)=><span key={`d-${i}`}>• {n} •</span>)}</div></div>
      <style>{`@keyframes marquee{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}`}</style>
      
      <header className={`${highContrast ? "bg-black border-white" : "bg-white"} border-b px-3 py-3 flex flex-wrap justify-between items-center sticky top-0 z-[1000] gap-2`}>
        <div className="flex items-center gap-2 justify-center flex-1 lg:flex-none">
          <div className="bg-black text-white w-10 h-10 rounded-xl flex items-center justify-center font-black text-[12px]">GC</div>
          <div className="text-center lg:text-left"><h1 className="font-black text-[14px] tracking-[0.2em]">GEOCLIMA VALE</h1><p className="text-[10px] text-gray-500 font-bold">Vale do Paraíba e Litoral Norte • 39 municípios • UNIVESP</p></div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <select value={municipioFiltro} onChange={e => { setMunicipioFiltro(e.target.value); if(e.target.value!=="Todos" && COORDS[e.target.value]) mapRef.current?.setView(COORDS[e.target.value], 13); else mapRef.current?.setView([-23.3,-45.5],9.5); }} className="border rounded-full px-3 py-1.5 text-[11px] font-bold bg-white max-w-[150px]"><option value="Todos">Todos - 39 ({pontos.length})</option>{MUNICIPIOS_RMVALE.map(m => <option key={m} value={m}>{m}</option>)}</select>
          <button onClick={centralizarNoUsuario} className="px-3 py-1.5 rounded-full text-[11px] font-black bg-blue-600 text-white">Minha localização</button>
          <button onClick={instalarPWA} className="bg-black text-white px-3 py-1.5 rounded-full text-[11px] font-bold">Instalar App</button>
        </div>
      </header>

      <div className="px-3 py-2 bg-white border-b flex gap-2">
        <div className="bg-gray-100 rounded-full p-1 flex">
          <button onClick={()=>setTab("usuario")} className={`px-5 py-1.5 rounded-full text-[11px] font-black ${tab==="usuario" ? "bg-black text-white shadow" : "text-gray-500"}`}>Mapa Colaborativo</button>
          <button onClick={()=>setTab("adm")} className={`px-5 py-1.5 rounded-full text-[11px] font-black ${tab==="adm" ? "bg-[#0f172a] text-white shadow" : "text-gray-500"}`}>Painel Técnico - ADM</button>
        </div>
      </div>

      {tab==="usuario" ? (
        <>
          {/* MOBILE: BOTÃO TOPO */}
          <div className="lg:hidden bg-[#0f172a] px-4 py-5 text-center">
            <h2 className="text-white font-black text-[13px] tracking-widest">REGISTRAR OCORRÊNCIA</h2>
            <div className="flex gap-2 justify-center flex-wrap mt-3 mb-4">
              <span className="text-[10px] bg-red-600 text-white px-3 py-1 rounded-full font-black">Tempo real</span>
              <span className="text-[10px] bg-green-600 text-white px-3 py-1 rounded-full font-black">Localização automática</span>
              <span className="text-[10px] bg-blue-600 text-white px-3 py-1 rounded-full font-black">Endereço automático</span>
            </div>
            <button onClick={()=> document.getElementById('form-anchor')?.scrollIntoView({behavior:'smooth'})} className="bg-orange-600 text-white rounded-full px-8 py-3 text-[13px] font-black border-2 border-white/20">
              📍 REGISTRAR OCORRÊNCIA AGORA
            </button>
          </div>

          {/* PC: 3 COLUNAS INTACTO - MOBILE: MESMO MAPA MAS COM ORDEM DIFERENTE VIA CSS */}
          <main className="grid grid-cols-1 lg:grid-cols-[380px_1fr_380px] lg:h-[calc(100vh-124px)]">
            
            {/* FORM - PC ESQUERDA (order-1) / MOBILE FIM (order-3) */}
            <section id="form-anchor" className="bg-white border-r flex flex-col order-3 lg:order-1 overflow-auto">
              <div className="bg-[#0f172a] text-white p-4 hidden lg:block">
                <h2 className="font-black text-[12px] tracking-widest">REGISTRAR OCORRÊNCIA</h2>
                <div className="mt-3 flex gap-2 flex-wrap justify-center">
                  <span className="text-[10px] bg-red-600 text-white px-3 py-1 rounded-full font-black">Monitoramento em tempo real</span>
                  <span className="text-[10px] bg-green-600 text-white px-3 py-1 rounded-full font-black">Localização automática</span>
                  <span className="text-[10px] bg-blue-600 text-white px-3 py-1 rounded-full font-black">Endereço automático</span>
                </div>
              </div>
              <div className="lg:hidden bg-[#0f172a] text-white p-3">
                <h2 className="font-black text-[12px]">INSERIR OCORRÊNCIA</h2>
                <p className="text-[11px] text-white/60">Toque no mapa acima, endereço preenche automático</p>
              </div>
              <Formulario />
            </section>

            {/* MAPA - ÚNICO, MESMO ELEMENTO PARA PC E MOBILE */}
            <section className="bg-white flex flex-col order-2 lg:order-2 min-h-[380px] h-[45vh] lg:h-auto lg:min-h-[500px]">
              <div className="px-3 py-2 border-b bg-gray-50 text-[10px] font-bold flex justify-between items-center">
                <span>{filtrados.length} ocorrências • Toque no mapa</span>
                <button onClick={centralizarNoUsuario} className="bg-blue-600 text-white px-3 py-1 rounded-full lg:hidden">Minha localização</button>
              </div>
              <div ref={mapDiv} className="flex-1 bg-gray-100 min-h-[380px]" />
              <div className="px-3 py-2 bg-[#0f172a] text-white text-[10px] flex justify-between"><span>39 municípios</span><span>{coords ? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : "Toque no mapa"}</span></div>
            </section>

            {/* LISTA - PC DIREITA (order-3) / MOBILE QUASE TOPO (order-1) */}
            <section className="bg-[#fcfcfc] border-l flex flex-col order-1 lg:order-3 overflow-auto max-h-[60vh] lg:max-h-none">
              <div className="p-3 border-b bg-white sticky top-0 z-10">
                <div className="flex gap-2 mb-2">
                  <button onClick={() => setFiltroStatus("todos")} className={`flex-1 py-2 rounded-full text-[11px] font-black ${filtroStatus === "todos" ? "bg-black text-white" : "bg-gray-100"}`}>Todos • {filtrados.length}</button>
                  <button onClick={() => setFiltroStatus("agora")} className={`flex-1 py-2 rounded-full text-[11px] font-black ${filtroStatus === "agora" ? "bg-red-600 text-white" : "bg-red-50 text-red-600 border"}`}>Atenção • {filtrados.filter(p => p.statusRua !== "Livre").length}</button>
                </div>
                <div className="bg-black text-white rounded-xl p-3">
                  <div className="text-[10px] text-white/60 font-black">RMVALE - 39 MUNICÍPIOS</div>
                  <div className="text-[16px] font-black">{filtrados.filter(p => p.statusRua !== "Livre").length} ruas com ocorrência</div>
                  <div className="text-[11px] text-white/70">{filtrados.reduce((a, b) => a + b.qtd, 0)} registros • Últimos 90 dias</div>
                </div>
              </div>
              <div className="p-3 space-y-3 overflow-auto">
                {filtrados.map(p => (
                  <div key={String(p.id)} onClick={() => mapRef.current?.setView([p.lat, p.lng], 14)} className={`bg-white border-2 rounded-2xl p-3 cursor-pointer shadow-sm ${p.statusRua !== "Livre" ? "border-red-200" : "border-gray-100"}`}>
                    <div className="flex justify-between"><div className="flex gap-2"><div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">{p.tipo.emoji}</div><div><div className="font-black text-[12px]">{p.municipio} - {p.rua}</div><div className="text-[10px] text-gray-500">{p.bairro} • {p.tipo.categoria}</div></div></div><span className={`text-[8px] px-2 py-1 rounded-full font-black h-fit ${p.statusRua === "Interditada" ? "bg-red-600 text-white" : p.statusRua === "Alagada" ? "bg-orange-500 text-white" : "bg-gray-100"}`}>{p.statusRua}</span></div>
                    {p.foto && <img src={p.foto} alt={`Foto ${p.rua}`} className="w-full h-40 object-cover rounded-xl mt-2" />}
                    <div className="mt-2 flex gap-2"><span className="text-[10px] bg-black text-white px-2 py-1 rounded-full font-bold">{p.tipo.simples}</span><span className="text-[9px] text-gray-500">{p.qtd} registros</span></div>
                  </div>
                ))}
              </div>
            </section>
          </main>
        </>
      ) : (
        <div className="px-4 py-4 space-y-4 bg-[#f8fafc] min-h-[calc(100vh-124px)]">
          <div className="bg-[#0f172a] text-white rounded-xl p-5"><h2 className="font-black text-[14px]">PAINEL TÉCNICO - 39 MUNICÍPIOS</h2></div>
          <div className="bg-white rounded-xl border overflow-auto">
            <table className="w-full text-xs"><thead className="bg-gray-50 text-[10px]"><tr><th className="p-3 text-left">Local / Foto</th><th className="p-3 text-left">Tipo</th><th className="p-3">Situação</th><th className="p-3">Ação</th></tr></thead><tbody>{filtrados.map(p=>(<tr key={String(p.id)} className="border-t"><td className="p-3"><div className="font-bold">{p.municipio} - {p.rua}</div>{p.foto && <img src={p.foto} alt="foto" className="w-24 h-16 object-cover rounded mt-1"/>}</td><td className="p-3">{p.tipo.simples}</td><td className="p-3">{p.statusRua}</td><td className="p-3"><button className="bg-black text-white px-3 py-1 rounded-full text-[10px]">Validar</button></td></tr>))}</tbody></table>
          </div>
        </div>
      )}
    </div>
  );
}
