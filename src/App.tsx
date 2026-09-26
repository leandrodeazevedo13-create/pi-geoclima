import { useEffect, useRef, useState, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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
  { simples: "Rua alagada agora", tecnico: "Alagamento", emoji: "🚫", categoria: "Água/Chuva", risco: "Chuva intensa + mare alta" },
  { simples: "Enxurrada forte", tecnico: "Enxurrada", emoji: "🌊", categoria: "Água/Chuva", risco: "Chuva >30mm/h" },
  { simples: "Rio transbordou", tecnico: "Inundação fluvial", emoji: "🏞️", categoria: "Água/Chuva", risco: "Chuva 72h" },
  { simples: "Mar avançou / ressaca", tecnico: "Ressaca", emoji: "🌊", categoria: "Água/Chuva", risco: "Mare alta + ressaca" },
  { simples: "Bueiro entupido", tecnico: "Bueiro obstruido", emoji: "🕳️", categoria: "Infra Urbana", risco: "Falta manutencao" },
  { simples: "Rua que sempre alaga", tecnico: "Galeria subdimensionada", emoji: "💧", categoria: "Infra Urbana", risco: "Drenagem insuficiente" },
  { simples: "Barro desceu", tecnico: "Deslizamento", emoji: "⛰️", categoria: "Terra/Encosta", risco: "Chuva + solo encharcado" },
  { simples: "Barranco rachou", tecnico: "Risco deslizamento", emoji: "⚠️", categoria: "Terra/Encosta", risco: "Infiltracao" },
  { simples: "Erosão buraco", tecnico: "Erosão", emoji: "🕳️", categoria: "Terra/Encosta", risco: "Solo exposto" },
  { simples: "Muro caiu", tecnico: "Colapso contencao", emoji: "🧱", categoria: "Terra/Encosta", risco: "Saturacao solo" },
  { simples: "Árvore caiu", tecnico: "Queda de arvore", emoji: "🌳", categoria: "Vento/Tempo", risco: "Vento + solo" },
  { simples: "Vento destelhou", tecnico: "Vendaval", emoji: "💨", categoria: "Vento/Tempo", risco: "Rajada >60km/h" },
  { simples: "Raio caiu", tecnico: "Descarga eletrica", emoji: "⚡", categoria: "Vento/Tempo", risco: "Tempestade eletrica" },
  { simples: "Granizo", tecnico: "Granizo", emoji: "🧊", categoria: "Vento/Tempo", risco: "Cumulonimbus" },
  { simples: "Lixo entulho", tecnico: "Acumulo residuos", emoji: "🗑️", categoria: "Infra Urbana", risco: "Obstrucao" },
  { simples: "Mato alto", tecnico: "Vegetacao", emoji: "🌿", categoria: "Infra Urbana", risco: "Falta rocada" },
  { simples: "Obra atrapalhando", tecnico: "Obra irregular", emoji: "🚧", categoria: "Infra Urbana", risco: "Antropica" },
];

type Ponto = { id: number; lat: number; lng: number; municipio: string; bairro: string; rua: string; tipo: Tipo; qtd: number; freq: "Alta" | "Média" | "Baixa"; statusRua: "Livre" | "Alagada" | "Interditada" | "Risco"; foto?: string; obs?: string; quando: string; };

const INICIAL: Ponto[] = [
  { id: 1, lat: -23.4342, lng: -45.0835, municipio: "Ubatuba", bairro: "Centro", rua: "Hans Staden, 345", tipo: TIPOS[0], qtd: 12, freq: "Alta", quando: "Ontem 18h", statusRua: "Interditada" },
  { id: 2, lat: -23.62, lng: -45.4125, municipio: "Caraguatatuba", bairro: "Martim de Sá", rua: "Av. da Praia, 100", tipo: TIPOS[3], qtd: 8, freq: "Alta", quando: "Hoje 06h", statusRua: "Alagada" },
  { id: 3, lat: -23.1791, lng: -45.8869, municipio: "São José dos Campos", bairro: "Vila Industrial", rua: "Rua Paraibuna, 200", tipo: TIPOS[4], qtd: 15, freq: "Alta", quando: "Hoje 07h", statusRua: "Alagada" },
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
    script.onload = () => { // @ts-ignore
      if (window.VLibras) { // @ts-ignore
        new window.VLibras.Widget('https://vlibras.gov.br/app'); } };
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
            <div className="bg-white sticky top-0 z-10 p-4 flex justify-between items-center border-b"><div className="flex items-center gap-2"><span className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-white">🤟</span><div><div className="font-black text-[14px]">VLibras + Hand Talk</div><div className="text-[10px] text-gray-500">Acessibilidade total</div></div></div><button onClick={() => setOpen(false)} className="w-8 h-8 rounded-full hover:bg-gray-100">✕</button></div>
            <div className="p-4 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-[11px]"><div className="font-black text-blue-900">✅ VLibras já funcionando</div><div className="text-[10px] mt-1">Bonequinho azul no canto → clique e selecione texto para traduzir em Libras. Link: vlibras.gov.br</div></div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setFontSize((s: number) => Math.min(150, s + 10))} className={`bg-white rounded-xl p-4 border text-left ${fontSize > 100 ? "border-orange-500 bg-orange-50" : ""}`}><div className="text-[28px] font-black">A+</div><div className="text-[12px] font-bold">Tamanho fonte {fontSize}%</div></button>
                <button onClick={() => setFontSize(100)} className="bg-white rounded-xl p-4 border text-left"><div className="text-[24px]">A</div><div className="text-[12px] font-bold">Fonte normal</div></button>
                <button onClick={() => setHighContrast(!highContrast)} className={`bg-white rounded-xl p-4 border text-left ${highContrast ? "border-orange-500 bg-orange-50" : ""}`}><div className="text-[22px]">◐</div><div className="text-[12px] font-bold">Contraste</div></button>
                <button onClick={() => { const u = new SpeechSynthesisUtterance("Geoclima Vale, 39 municípios, Vale do Paraíba e Litoral Norte. Mapa com alfinete azul."); u.lang="pt-BR"; speechSynthesis.speak(u); }} className="bg-white rounded-xl p-4 border text-left"><div className="text-[22px]">🗣️</div><div className="text-[12px] font-bold">Leitor de sites</div></button>
              </div>
              <div className="bg-white rounded-xl p-3 border text-[11px]"><div className="font-black">📲 PWA - Virar App</div><div className="text-[10px] mt-1">No Chrome celular: menu ⋮ → Adicionar à tela inicial → Instalar. Funciona offline!</div></div>
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
  const userLocationRef = useRef<L.Marker | null>(null);
  const [pontos, setPontos] = useState<Ponto[]>(() => {
    try { const s = localStorage.getItem("geoclima_rmvale_39"); if (s) return JSON.parse(s).map((p: any) => ({ ...p, tipo: TIPOS.find(t => t.tecnico === p.tipo?.tecnico) || TIPOS[0] })); } catch {}
    return INICIAL;
  });
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [enderecoAuto, setEnderecoAuto] = useState<string>("");
  const [carregandoEndereco, setCarregandoEndereco] = useState(false);
  const [tipoSel, setTipoSel] = useState<Tipo>(TIPOS[0]);
  const [rua, setRua] = useState(""); // agora auto-preenchido, editável
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

  // PWA install prompt
  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e: any) => {
      e.preventDefault();
      setPwaInstallPrompt(e);
    });
    // Registrar Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(() => console.log('SW registrado')).catch(() => {});
    }
  }, []);

  const instalarPWA = () => {
    if (pwaInstallPrompt) {
      pwaInstallPrompt.prompt();
      pwaInstallPrompt.userChoice.then((choice: any) => {
        if (choice.outcome === 'accepted') console.log('PWA instalado');
        setPwaInstallPrompt(null);
      });
    } else {
      alert('No Chrome celular: clique nos 3 pontinhos ⋮ no topo → "Adicionar à tela inicial" ou "Instalar app". No PC: ícone de instalar na barra de endereço.');
    }
  };

  // Reverse geocoding - endereço automático pelo alfinete
  const buscarEndereco = async (lat: number, lng: number) => {
    setCarregandoEndereco(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
        headers: { 'Accept-Language': 'pt-BR' }
      });
      const data = await res.json();
      const addr = data.address || {};
      const ruaAuto = `${addr.road || addr.pedestrian || addr.footway || addr.street || ""} ${addr.house_number || ""}`.trim() || data.display_name?.split(',')[0] || `Ponto ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      const bairroAuto = addr.suburb || addr.neighbourhood || addr.quarter || addr.village || addr.town || "";
      const municipioAuto = addr.city || addr.town || addr.municipality || addr.county || "";
      
      setEnderecoAuto(data.display_name || "");
      setRua(ruaAuto);
      if (bairroAuto) setBairro(bairroAuto);
      // Tenta achar município nos 39
      if (municipioAuto) {
        const match = MUNICIPIOS_RMVALE.find(m => municipioAuto.toLowerCase().includes(m.toLowerCase()) || m.toLowerCase().includes(municipioAuto.toLowerCase()));
        if (match) setMunicipio(match);
      }
    } catch (e) {
      setRua(`Lat ${lat.toFixed(5)}, Lng ${lng.toFixed(5)}`);
      setEnderecoAuto("Endereço não encontrado - edite manualmente");
    }
    setCarregandoEndereco(false);
  };

  useEffect(() => { localStorage.setItem("geoclima_rmvale_39", JSON.stringify(pontos)); }, [pontos]);

  const filtrados = useMemo(() => {
    let l = [...pontos];
    if (filtroCat !== "Todas") l = l.filter(p => p.tipo.categoria === filtroCat);
    if (filtroStatus === "agora") l = l.filter(p => p.statusRua !== "Livre");
    if (municipioFiltro !== "Todos") l = l.filter(p => p.municipio === municipioFiltro);
    return l;
  }, [pontos, filtroCat, filtroStatus, municipioFiltro]);

  // Inicializa mapa + GEOLOCALIZAÇÃO AUTOMÁTICA
  useEffect(() => {
    if (!mapDiv.current || mapRef.current) return;
    const map = L.map(mapDiv.current, { zoomControl: false }).setView([-23.3, -45.5], 9.5);
    mapRef.current = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM', maxZoom: 19 }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    map.on('click', (e: any) => {
      const c = { lat: e.latlng.lat, lng: e.latlng.lng };
      setCoords(c);
      buscarEndereco(c.lat, c.lng);
    });

    // GEOLOCALIZAÇÃO - FIXA NA LOCALIZAÇÃO ATUAL AO ENTRAR
    if (navigator.geolocation) {
      setGpsStatus("buscando");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserCoords(c);
          setGpsStatus("ok");
          map.setView([c.lat, c.lng], 15);
          
          // Marca azul de localização atual do usuário
          const userIcon = L.divIcon({
            html: `<div style="position:relative"><div style="background:#4285F4;width:18px;height:18px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div><div style="position:absolute;top:-6px;left:-6px;width:30px;height:30px;background:rgba(66,133,244,0.2);border-radius:50%;animation:pulse 2s infinite"></div></div><style>@keyframes pulse{0%{transform:scale(1);opacity:1}100%{transform:scale(2);opacity:0}}</style>`,
            iconSize: [18, 18], iconAnchor: [9, 9], className: ""
          });
          if (userLocationRef.current) map.removeLayer(userLocationRef.current);
          userLocationRef.current = L.marker([c.lat, c.lng], { icon: userIcon } as any).addTo(map).bindPopup("📍 Você está aqui - localização atual");
          
          // Já coloca alfinete na localização atual também
          setCoords(c);
          buscarEndereco(c.lat, c.lng);
        },
        (err) => {
          console.log("GPS erro:", err);
          setGpsStatus("erro");
          // Mantém visão geral do Vale se não permitir GPS
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    } else {
      setGpsStatus("erro");
    }

    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Botão "Minha localização"
  const centralizarNoUsuario = () => {
    if (userCoords && mapRef.current) {
      mapRef.current.setView([userCoords.lat, userCoords.lng], 16);
      setCoords(userCoords);
      buscarEndereco(userCoords.lat, userCoords.lng);
    } else if (navigator.geolocation) {
      setGpsStatus("buscando");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserCoords(c);
          setGpsStatus("ok");
          mapRef.current?.setView([c.lat, c.lng], 16);
          setCoords(c);
          buscarEndereco(c.lat, c.lng);
        },
        () => { setGpsStatus("erro"); alert("Não foi possível pegar sua localização. Verifique permissão de GPS no navegador."); }
      );
    }
  };

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.eachLayer((layer: any) => { 
      if (layer instanceof L.Marker && layer !== userLocationRef.current) {
        // Não remove o marcador de usuário
        const isUserMarker = layer === userLocationRef.current;
        if (!isUserMarker) mapRef.current?.removeLayer(layer);
      }
    });
    // Re-adiciona marcador de usuário se existir
    if (userLocationRef.current && userCoords) {
      userLocationRef.current.addTo(mapRef.current!);
    }
    
    filtrados.forEach(p => {
      const color = p.statusRua === "Interditada" ? "#ef4444" : p.statusRua === "Risco" ? "#dc2626" : p.statusRua === "Alagada" ? "#f97316" : "#eab308";
      const icon = L.divIcon({
        html: `<div style="background:${color};width:32px;height:32px;border-radius:50%;border:3px solid white;box-shadow:0 3px 10px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-size:16px">${p.tipo.emoji}</div>`,
        iconSize: [32, 32], iconAnchor: [16, 16], className: "",
      });
      const m = L.marker([p.lat, p.lng], { icon } as any).addTo(mapRef.current!);
      const fotoHtml = p.foto ? `<br/><img src="${p.foto}" style="width:200px;border-radius:8px;margin-top:6px"/>` : "";
      m.bindPopup(`<b>${p.municipio} - ${p.rua}</b><br/>${p.bairro} • ${p.statusRua} • ${p.tipo.categoria}<br/>Causa: ${p.tipo.risco}<br/>${p.qtd} conf • ${p.freq} 90d • ${p.tipo.tecnico}${fotoHtml}`);
    });
    if (coords) {
      const pinIcon = L.divIcon({
        html: `<div style="position:relative;filter:drop-shadow(0 4px 8px rgba(37,99,235,0.5))"><div style="background:#2563eb;width:44px;height:44px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;display:flex;align-items:center;justify-content:center"><span style="transform:rotate(45deg);font-size:22px">📍</span></div><div style="position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);width:14px;height:14px;background:#1d4ed8;border-radius:50%;border:2px solid white"></div><div style="position:absolute;top:-8px;left:50%;transform:translateX(-50%);background:#2563eb;color:white;font-size:8px;font-weight:900;padding:2px 6px;border-radius:10px;white-space:nowrap">NOVO LOCAL - ${municipio}</div></div>`,
        iconSize: [44, 52], iconAnchor: [22, 48], className: "",
      });
      const pin = L.marker([coords.lat, coords.lng], { icon: pinIcon, draggable: true } as any).addTo(mapRef.current!);
      pin.bindPopup(`<div><b style="color:#2563eb">📍 LOCAL MARCADO - ${municipio}</b><br/><span style="font-size:10px">${enderecoAuto || `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`}</span><br/><span style="font-size:9px;background:#e0f2fe;color:#0369a1;padding:2px 6px;border-radius:10px">Endereço preenchido automático - edite se precisar</span></div>`).openPopup();
      pin.on('dragend', (e: any) => { 
        const ll = e.target.getLatLng(); 
        const c = { lat: ll.lat, lng: ll.lng };
        setCoords(c); 
        buscarEndereco(c.lat, c.lng);
      });
    }
  }, [filtrados, coords, municipio, enderecoAuto, userCoords]);

  const handleFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert("Máx 5MB"); return; }
    const reader = new FileReader();
    reader.onload = () => setFoto(reader.result as string);
    reader.readAsDataURL(file);
  };

  const salvar = () => {
    if (!coords) { alert("Toque no mapa ou use 'Minha localização' para colocar alfinete azul 📍"); return; }
    // Rua agora é opcional porque já vem automático, mas pode editar
    const ruaFinal = rua.trim() || enderecoAuto || `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`;
    const novo: Ponto = { id: Date.now(), lat: coords.lat, lng: coords.lng, municipio, bairro, rua: ruaFinal, tipo: tipoSel, qtd: 1, freq: "Baixa", quando: "Agora", statusRua, foto, obs };
    setPontos(prev => [novo, ...prev]);
    setRua(""); setObs(""); setFoto(undefined); setCoords(null); setEnderecoAuto("");
    alert(`✅ Registrado em ${municipio} - ${ruaFinal}! Endereço automático pelo alfinete.`);
  };

  return (
    <div className={`${highContrast ? "bg-black text-white" : "bg-[#f8f9fb] text-black"} min-h-screen font-sans`} style={{ fontSize: `${fontSize}%` }}>
      <BarraAcessibilidade fontSize={fontSize} setFontSize={setFontSize} highContrast={highContrast} setHighContrast={setHighContrast} />

      <div role="alert" className="bg-[#dc2626] text-white text-[11px] py-2 overflow-hidden whitespace-nowrap font-bold">
        <div className="flex gap-10 animate-[marquee_40s_linear_infinite]">
          <span>📍 GPS: Mapa já abre na sua localização • </span>
          <span>📲 PWA: Instale como app pelo Chrome • </span>
          <span>📝 Endereço automático pelo alfinete - edite se precisar • </span>
          <span>ALERTA INMET: Vale do Paraíba e Litoral Norte - 39 municípios • </span>
        </div>
      </div>
      <style>{`@keyframes marquee{0%{transform:translateX(0)}100%{transform:translateX(-50%)}} *:focus-visible{outline:3px solid #2563eb; outline-offset:2px}`}</style>

      <header className={`${highContrast ? "bg-black border-white" : "bg-white"} border-b px-3 py-2.5 flex flex-wrap justify-between items-center sticky top-0 z-[1000] gap-2`}>
        <div className="flex items-center gap-2">
          <div className="bg-black text-white w-8 h-8 rounded-lg flex items-center justify-center font-black text-[11px]">GC</div>
          <div>
            <h1 className="font-black text-[13px] leading-tight">GEOCLIMA VALE - 39 MUNICÍPIOS - GPS + PWA</h1>
            <p className="text-[10px] text-gray-500">📍 Auto GPS • 📲 PWA App • 📝 Endereço auto • VLibras • Alfinete azul</p>
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <select value={municipioFiltro} onChange={e => { setMunicipioFiltro(e.target.value); if(e.target.value!=="Todos" && COORDS[e.target.value]) mapRef.current?.setView(COORDS[e.target.value], 13); else mapRef.current?.setView([-23.3,-45.5],9.5); }} className="border rounded-full px-3 py-1.5 text-[11px] font-bold bg-white max-w-[150px]">
            <option value="Todos">📍 39 - Todos ({pontos.length})</option>
            {MUNICIPIOS_RMVALE.map(m => <option key={m} value={m}>📍 {m}</option>)}
          </select>
          <button onClick={centralizarNoUsuario} className={`px-3 py-1.5 rounded-full text-[11px] font-black border ${gpsStatus==="ok"?"bg-blue-600 text-white border-blue-600":gpsStatus==="buscando"?"bg-yellow-100 text-yellow-800 animate-pulse":"bg-gray-100"}`}>
            {gpsStatus==="buscando" ? "📡 Buscando GPS..." : gpsStatus==="ok" ? "📍 Minha localização" : "📍 Ativar GPS"}
          </button>
          <button onClick={instalarPWA} className="bg-black text-white px-3 py-1.5 rounded-full text-[11px] font-bold">📲 Instalar App</button>
        </div>
      </header>

      <main id="conteudo" className="grid grid-cols-1 lg:grid-cols-[380px_1fr_380px] h-[calc(100vh-88px)]">
        <section className={`${highContrast ? "bg-black" : "bg-white"} border-r flex flex-col order-2 lg:order-1 overflow-auto`}>
          <div className={`${highContrast ? "bg-white text-black" : "bg-[#0f172a] text-white"} p-4 border-b`}>
            <h2 className="font-black text-[12px] tracking-widest">📤 ENVIAR - GPS + ENDEREÇO AUTOMÁTICO</h2>
            <p className="text-[11px] mt-1 opacity-70">📍 Mapa já abre onde você está • Endereço vem automático do alfinete • Edite se precisar</p>
            <div className="mt-2 flex gap-2 flex-wrap">
              <span className="text-[10px] bg-green-600 text-white px-2 py-1 rounded-full font-bold">📍 GPS automático ao abrir</span>
              <span className="text-[10px] bg-blue-600 text-white px-2 py-1 rounded-full font-bold">📝 Rua auto pelo alfinete</span>
              <span className="text-[10px] bg-black text-white px-2 py-1 rounded-full font-bold">📲 PWA instalável</span>
            </div>
          </div>
          <div className="p-4 space-y-3">
            <div className={`${coords ? "bg-blue-50 border-blue-300 text-blue-900" : "bg-amber-50 border-amber-200"} border rounded-xl p-2.5 text-[11px] font-bold`}>
              {gpsStatus==="buscando" ? "📡 Buscando sua localização GPS..." : coords ? `📍 Alfinete em: ${enderecoAuto ? enderecoAuto.substring(0,80) : `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`} - ${municipio}` : "📍 Toque no mapa ou clique em 'Minha localização'"}
              {carregandoEndereco && <span className="ml-2 animate-pulse">🔍 Buscando endereço...</span>}
            </div>

            <div>
              <label className="text-[10px] font-black">MUNICÍPIO (39 - RMVale) - detectado automático</label>
              <select value={municipio} onChange={e => setMunicipio(e.target.value)} className="w-full border-2 border-black rounded-xl p-3 text-[12px] font-bold mt-1 bg-white">
                {MUNICIPIOS_RMVALE.map(m => <option key={m} value={m}>📍 {m}</option>)}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-black">CATEGORIA</label>
              <select value={filtroCat} onChange={e => setFiltroCat(e.target.value as any)} className="w-full border rounded-xl p-2.5 text-[12px] mt-1 font-bold">
                <option value="Todas">Todas (17)</option>
                <option value="Água/Chuva">💧 Água/Chuva (4)</option>
                <option value="Terra/Encosta">⛰️ Terra/Encosta (4)</option>
                <option value="Vento/Tempo">💨 Vento/Tempo (4)</option>
                <option value="Infra Urbana">🏙️ Infra (5)</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-black">O QUE TÁ ACONTECENDO? (17)</label>
              <select value={tipoSel.tecnico} onChange={e => setTipoSel(TIPOS.find(t => t.tecnico === e.target.value)!)} className="w-full border-2 border-black rounded-xl p-3 text-[12px] font-bold mt-1">
                {TIPOS.filter(t => filtroCat === "Todas" || t.categoria === filtroCat).map(t => (
                  <option key={t.tecnico} value={t.tecnico}>{t.emoji} {t.simples} - {t.categoria}</option>
                ))}
              </select>
            </div>

            {/* ENDEREÇO AUTOMÁTICO - NOVO */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
              <label className="text-[10px] font-black text-blue-900">📍 ENDEREÇO AUTOMÁTICO PELO ALFINETE - EDITE SE PRECISAR</label>
              <div className="mt-2">
                <label className="text-[9px] font-bold text-gray-600">Rua / Local - preenchido automático (editável)</label>
                <div className="flex gap-2 mt-1">
                  <input value={rua} onChange={e => setRua(e.target.value)} placeholder="Ex: Rua Hans Staden, 345 - será preenchido automático" className="flex-1 border rounded-xl p-3 text-[12px] bg-white" />
                  <button onClick={() => { if(coords) buscarEndereco(coords.lat, coords.lng); }} className="bg-blue-600 text-white px-3 py-2 rounded-xl text-[10px] font-bold">🔄 Atualizar</button>
                </div>
                {enderecoAuto && <div className="text-[9px] text-gray-500 mt-1 bg-white rounded-full px-2 py-1">Completo: {enderecoAuto.substring(0,100)}...</div>}
                <div className="text-[9px] text-blue-700 mt-1">💡 Dica: Arraste o alfinete azul no mapa que o endereço atualiza sozinho. Deixe vazio que usa GPS.</div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <div><label className="text-[9px] font-bold">Bairro (auto)</label><input value={bairro} onChange={e => setBairro(e.target.value)} className="w-full border rounded-xl p-2.5 text-[11px] mt-1 bg-white" /></div>
                <div><label className="text-[9px] font-bold">Status</label><select value={statusRua} onChange={e => setStatusRua(e.target.value as any)} className="w-full border rounded-xl p-2.5 text-[11px] mt-1 bg-white"><option value="Interditada">🚫 Interditada</option><option value="Alagada">🌊 Alagada</option><option value="Risco">⚠️ Risco</option><option value="Livre">✅ Livre</option></select></div>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold">📸 FOTO (ADM vê)</label>
              <label className="mt-1 w-full border-2 border-dashed rounded-xl p-3 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50">
                <input type="file" accept="image/*" capture="environment" onChange={handleFoto} className="sr-only" />
                {foto ? <img src={foto} alt="Previa" className="w-full h-36 object-cover rounded-lg" /> : <><span className="text-2xl">📷</span><span className="text-[11px] font-bold">Tirar foto / galeria</span><span className="text-[10px] text-gray-500">Prova CEMADEN</span></>}
              </label>
              {foto && <button onClick={() => setFoto(undefined)} className="text-[11px] underline mt-1">Remover foto</button>}
            </div>

            <div><label className="text-[10px] font-bold">Obs - opcional</label><textarea value={obs} onChange={e => setObs(e.target.value)} placeholder="Ex: água 30cm, maré 1.8m, rajada 60km/h - opcional" className="w-full border rounded-xl p-2.5 text-[12px] h-14 mt-1" /></div>

            <button onClick={salvar} className="w-full bg-red-600 text-white rounded-full py-3.5 text-[13px] font-black">🚨 CONFIRMAR - {municipio} - {rua ? rua.substring(0,20) : "Alfinete"}</button>
            <div className="text-[9px] text-center text-gray-400">📍 GPS automático • 📝 Endereço auto pelo alfinete • ✏️ Editável • 📲 PWA</div>
          </div>
        </section>

        <section className="order-1 lg:order-2 bg-white flex flex-col min-h-[500px]">
          <div className="px-3 py-2 border-b flex gap-2 text-[10px] font-bold bg-blue-50 flex-wrap items-center">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-blue-600 rounded-full animate-pulse"></span>ALFINETE AZUL - ENDEREÇO AUTO</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-[#4285F4] rounded-full border-2 border-white"></span>VOCÊ AQUI</span>
            <button onClick={centralizarNoUsuario} className="ml-auto bg-blue-600 text-white px-3 py-1 rounded-full text-[10px] font-black">📍 Minha localização</button>
            <span className="text-[9px] bg-green-100 text-green-800 px-2 py-1 rounded-full">{gpsStatus==="ok" ? "GPS ativo" : gpsStatus==="buscando" ? "Buscando GPS..." : "GPS desativado"}</span>
          </div>
          <div ref={mapDiv} className="flex-1 bg-gray-100 min-h-[400px]" role="application" tabIndex={0} aria-label="Mapa com GPS automático" />
          <div className="px-3 py-2 bg-[#0f172a] text-white text-[10px] flex justify-between font-bold flex-wrap gap-1">
            <span>🗺️ GPS automático ao abrir • 📍 Alfinete azul arrastável → endereço auto • 📲 PWA instalável</span>
            <span className="bg-white/20 px-2 py-0.5 rounded-full">{coords ? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : "Sem alfinete"}</span>
          </div>
        </section>

        <section className="order-3 bg-[#fcfcfc] border-l flex flex-col">
          <div className="p-3 border-b bg-white">
            <div className="flex gap-2 mb-2">
              <button onClick={() => setFiltroStatus("todos")} className={`flex-1 py-2 rounded-full text-[11px] font-black ${filtroStatus === "todos" ? "bg-black text-white" : "bg-gray-100"}`}>Todos • {filtrados.length}</button>
              <button onClick={() => setFiltroStatus("agora")} className={`flex-1 py-2 rounded-full text-[11px] font-black ${filtroStatus === "agora" ? "bg-red-600 text-white" : "bg-red-50 text-red-600 border"}`}>🚨 Agora • {filtrados.filter(p => p.statusRua !== "Livre").length}</button>
            </div>
            <div className="bg-black text-white rounded-xl p-3">
              <div className="text-[10px] text-white/60 font-black">RMVale - {municipioFiltro==="Todos" ? "39 MUNICÍPIOS - GPS + PWA" : municipioFiltro.toUpperCase()}</div>
              <div className="text-[16px] font-black">{filtrados.filter(p => p.statusRua !== "Livre").length} ruas com problema</div>
              <div className="text-[11px] text-white/70">{filtrados.reduce((a, b) => a + b.qtd, 0)} conf 90d • Endereço auto • GPS</div>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-3 space-y-2">
            {filtrados.map(p => (
              <div key={p.id} onClick={() => mapRef.current?.setView([p.lat, p.lng], 14)} className={`bg-white border rounded-2xl p-3 cursor-pointer hover:border-black ${p.statusRua !== "Livre" ? "border-red-200" : ""}`}>
                <div className="flex justify-between">
                  <div className="flex gap-2">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">{p.tipo.emoji}</div>
                    <div>
                      <div className="font-black text-[12px]">{p.municipio} - {p.rua}</div>
                      <div className="text-[10px] text-gray-500">{p.bairro} • {p.tipo.categoria} • {p.tipo.risco}</div>
                    </div>
                  </div>
                  <span className={`text-[8px] px-2 py-1 rounded-full font-black h-fit ${p.statusRua === "Interditada" ? "bg-red-600 text-white" : p.statusRua === "Risco" ? "bg-red-800 text-white" : p.statusRua === "Alagada" ? "bg-orange-500 text-white" : "bg-gray-100"}`}>{p.statusRua}</span>
                </div>
                {p.foto && <img src={p.foto} alt={`Foto ${p.rua}`} className="w-full h-28 object-cover rounded-xl mt-2" />}
                <div className="mt-2 flex gap-2 flex-wrap">
                  <span className="text-[10px] bg-black text-white px-2 py-1 rounded-full font-bold">{p.tipo.simples}</span>
                  <span className="text-[9px] text-gray-500">{p.qtd} conf • {p.freq}</span>
                </div>
                <div className="text-[8px] text-gray-400 mt-1">{p.municipio} • Tecnico: {p.tipo.tecnico} • {p.obs || ""}</div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
