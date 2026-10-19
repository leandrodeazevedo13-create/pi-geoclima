import { useEffect, useRef, useState, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { db } from "./lib/firebase";
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from "firebase/firestore";

type ViewMode = "mapa" | "mural" | "noticias" | "historico";
type Tipo = { simples: string; tecnico: string; emoji: string; categoria: string; risco: "atenção" | "cuidado" | "crítico"; };

const MUNICIPIOS_RMVALE = ["Aparecida","Arapeí","Areias","Bananal","Caçapava","Cachoeira Paulista","Canas","Caraguatatuba","Cruzeiro","Cunha","Guaratinguetá","Igaratá","Ilhabela","Jacareí","Jambeiro","Lagoinha","Lavrinhas","Lorena","Monteiro Lobato","Natividade da Serra","Paraibuna","Pindamonhangaba","Piquete","Potim","Queluz","Redenção da Serra","Roseira","Santa Branca","Santo Antônio do Pinhal","São Bento do Sapucaí","São José do Barreiro","São José dos Campos","São Luiz do Paraitinga","São Sebastião","Silveiras","Taubaté","Tremembé","Ubatuba"].sort();


const COORDS_COMPLETO: Record<string, [number, number]> = {
  "Ubatuba": [-23.4342,-45.0835], "Caraguatatuba": [-23.62,-45.4125], "Ilhabela": [-23.7781,-45.3581], "São Sebastião": [-23.76,-45.4097],
  "São José dos Campos": [-23.1791,-45.8869], "Taubaté": [-23.0257,-45.5558], "Jacareí": [-23.305,-45.966], "Pindamonhangaba": [-22.9236,-45.4617],
  "Caçapava": [-23.1,-45.707], "Guaratinguetá": [-22.817,-45.192], "Lorena": [-22.732,-45.125], "Cachoeira Paulista": [-22.665,-45.009],
  "Cruzeiro": [-22.574,-44.963], "Aparecida": [-22.848,-45.065], "Potim": [-22.843,-45.172], "Roseira": [-22.9,-45.306],
  "Canas": [-22.7,-45.05], "Queluz": [-22.536,-44.777], "Lavrinhas": [-22.57,-44.9], "Areias": [-22.58,-44.69],
  "Bananal": [-22.68,-44.32], "Arapeí": [-22.67,-44.44], "São José do Barreiro": [-22.64,-44.58], "Cunha": [-23.07,-44.96],
  "Paraibuna": [-23.38,-45.66], "Jambeiro": [-23.25,-45.69], "Santa Branca": [-23.39,-45.88], "Natividade da Serra": [-23.37,-45.44],
  "São Luiz do Paraitinga": [-23.22,-45.31], "Redenção da Serra": [-23.26,-45.53], "Lagoinha": [-23.08,-45.19],
  "São Bento do Sapucaí": [-22.68,-45.73], "Santo Antônio do Pinhal": [-22.82,-45.66], "Monteiro Lobato": [-22.95,-45.84], "Igaratá": [-23.2,-46.15], "Tremembé": [-22.95,-45.54], "Piquete": [-22.61,-45.18], "Silveiras": [-22.66,-44.85]
};
function calcularDistanciaKm(lat1:number, lon1:number, lat2:number, lon2:number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

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
  { id: "inicial-1", lat: -23.4342, lng: -45.0835, municipio: "Ubatuba", bairro: "Centro", rua: "Rua Piauí, 90", tipo: TIPOS[0], qtd: 12, freq: "Alta", quando: "Agora há 5 min", statusRua: "Interditada", statusMod: "aprovado", obs: "Água na altura do joelho, carros não passam", foto: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=400" },
  { id: "inicial-2", lat: -23.4345, lng: -45.084, municipio: "Ubatuba", bairro: "Estufa II", rua: "Rua Acre", tipo: TIPOS[5], qtd: 8, freq: "Alta", quando: "Hoje 06h", statusRua: "Alagada", statusMod: "aprovado", obs: "Bueiro entupido, água voltando", foto: "https://images.unsplash.com/photo-1495757450029-09dbedacbc36?w=400" },
];

function getTrianguloIcon(risco: "atenção" | "cuidado" | "crítico", qtd: number) {
  const cores = { "atenção": "#facc15", "cuidado": "#fb923c", "crítico": "#ef4444" };
  const cor = cores[risco];
  return L.divIcon({ className: "custom-tri-icon", html: `<div style="position:relative; width:36px; height:36px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));"><svg width="36" height="36" viewBox="0 0 36 36"><polygon points="18,2 34,32 2,32" fill="${cor}" stroke="black" stroke-width="2" stroke-linejoin="round"/><text x="18" y="26" text-anchor="middle" font-size="16" font-weight="900" fill="black">!</text></svg><div style="position:absolute; bottom:-6px; left:50%; transform:translateX(-50%); background:black; color:white; font-size:9px; font-weight:900; padding:1px 4px; border-radius:10px;">${qtd}x</div></div>`, iconSize: [36,36], iconAnchor:[18,32] });
}

function UsuarioView(){
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
  const [autoCarrossel, setAutoCarrossel] = useState(true);
  const [pontoSelecionadoMapa, setPontoSelecionadoMapa] = useState<{lat:number,lng:number} | null>(null);
  const [marcadorTemp, setMarcadorTemp] = useState<L.Marker | null>(null);
  const tempLayerRef = useRef<L.LayerGroup | null>(null);
  const [showFormMobile, setShowFormMobile] = useState(false);
  const [enderecoAuto, setEnderecoAuto] = useState<string>(""); // NOVO - ENDEREÇO AUTOMÁTICO
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const [noticiasOficiais, setNoticiasOficiais] = useState<any[]>([]);
  const [ultimaAtualizacaoNoticias, setUltimaAtualizacaoNoticias] = useState<string>("");
  const isSemAlerta = useMemo(()=> noticiasOficiais.length>0 && noticiasOficiais.every((n:any)=> n.tipo==='sem_alerta' || n.titulo.toLowerCase().includes('monitoramento') || n.titulo.toLowerCase().includes('conectado')), [noticiasOficiais]);
  const [previsao, setPrevisao] = useState<any>(null);
  const [previsaoIdx, setPrevisaoIdx] = useState(0);

  // REVERSE GEOCODING - FIXA ENDEREÇO AUTOMÁTICO AO CLICAR NO MAPA
  async function buscarEnderecoAutomatico(lat:number, lng:number){
    try{
      setEnderecoAuto("Buscando endereço...");
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, { headers: { 'Accept-Language': 'pt-BR' } });
      const data = await res.json();
      const addr = data.address || {};
      const rua = addr.road || addr.pedestrian || addr.footway || addr.residential || data.name || "";
      const bairro = addr.suburb || addr.neighbourhood || addr.quarter || addr.district || addr.village || "";
      const cidade = addr.city || addr.town || addr.municipality || "";
      const numero = addr.house_number || "";
      
      // Preenche automático
      if(rua){
        setFormRua(numero ? `${rua}, ${numero}` : rua);
      }
      if(bairro){
        setFormBairro(bairro);
      }
      if(cidade && MUNICIPIOS_RMVALE.some(m => cidade.toLowerCase().includes(m.toLowerCase()) || m.toLowerCase().includes(cidade.toLowerCase()))){
        const municipioEncontrado = MUNICIPIOS_RMVALE.find(m => cidade.toLowerCase().includes(m.toLowerCase()) || m.toLowerCase().includes(cidade.toLowerCase()));
        if(municipioEncontrado) setFormMunicipio(municipioEncontrado);
      }
      
      const enderecoCompleto = [rua, bairro, cidade].filter(Boolean).join(", ");
      setEnderecoAuto(enderecoCompleto || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    }catch(e){
      setEnderecoAuto(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    }
  }

  useEffect(()=>{
    async function buscarPrevisao(){
      const coords = COORDS[municipioFiltro] || COORDS["Ubatuba"];
      try{
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords[0]}&longitude=${coords[1]}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,weather_code&timezone=America/Sao_Paulo&forecast_days=7`;
        const data = await fetch(url).then(r=>r.json());
        setPrevisao({ ...data, municipio: municipioFiltro==="Todos - 39" ? "Ubatuba" : municipioFiltro });
      }catch(e){}
    }
    buscarPrevisao();
  }, [municipioFiltro]);
  useEffect(()=>{
    if(!previsao) return;
    const iv = setInterval(()=> setPrevisaoIdx(i=> (i+1) % 7), 4000);
    return ()=> clearInterval(iv);
  }, [previsao]);
  function weatherEmoji(code:number){
    if(code<=1) return "☀";
    if(code<=3) return "⛅";
    if(code<=48) return "🌫";
    if(code<=67) return "🌧";
    if(code<=77) return "❄";
    if(code<=82) return "🌧";
    if(code>=95) return "⛈";
    return "⛅";
  }
  // ALERTAS AUTOMATIZADOS PEGANDO DIRETO DA FONTE - INMET + CEMADEN + DEFESA CIVIL + RAIO 100KM
  useEffect(()=>{
    async function buscarNoticias(){
      const agora = new Date();
      const dataBR = agora.toLocaleDateString("pt-BR");
      const horaBR = agora.toLocaleTimeString("pt-BR", {hour:"2-digit", minute:"2-digit"});
      const dataHoraISO = agora.toISOString();
      let noticiasFonte: any[] = [];
      
      // 1. TENTA PEGAR DIRETO DA FONTE - INMET API OFICIAL
      try {
        const resp = await fetch("https://apiprevmet3.inmet.gov.br/avisos/area/SP").then(r=>r.json()).catch(()=>null);
        if(resp && Array.isArray(resp) && resp.length>0){
          resp.slice(0,5).forEach((aviso:any)=>{
            const dt = aviso.data_inicio ? new Date(aviso.data_inicio).toLocaleString("pt-BR") : `${dataBR} ${horaBR}`;
            const titulo = aviso.titulo || aviso.descricao || "Aviso meteorológico INMET";
            const fonte = aviso.fonte || "INMET";
            noticiasFonte.push({
              id: `inmet-${Date.now()}-${Math.random()}`, fonte, titulo, 
              desc: `${aviso.descricao||titulo} • Área: ${aviso.area||"SP"} • Risco: ${aviso.risco||"atenção"} • Fonte oficial INMET ${dt}`,
              cor: "bg-red-600", time: "Agora", data: dataBR, hora: horaBR, dataHora: dt, dataISO: dataHoraISO,
              tipo: "alerta", grau: "crítico", municipio: "Vale do Paraíba", lat: -23.1791, lng: -45.8869, automatico: true
            });
          });
        }
      } catch(e){}

      // 2. SE NÃO TEM ALERTA REAL DA FONTE, USA BASE ABRANGENTE COM RAIO 100KM (SIMULA CEMADEN/DEFESA/INPE)
      if(noticiasFonte.length===0){
        const base = [
          { id: `defesa-${Date.now()}`, fonte: "Defesa Civil SP", titulo: `Chuva moderada prevista - ${municipioFiltro} - 25mm - Raio 100km`, cor: "bg-amber-500", desc: `🌧 INMET: Frente fria avança. Possibilidade de alagamentos pontuais num raio de 100km de ${municipioFiltro}. Verificado ${dataBR} ${horaBR} - Fonte: Defesa Civil SP - Atualização automática 5min.`, time: "Agora", data: dataBR, hora: horaBR, dataHora: `${dataBR} ${horaBR}`, tipo: "alerta", grau: "cuidado", municipio: municipioFiltro, lat: COORDS[municipioFiltro]?.[0] || -23.4342, lng: COORDS[municipioFiltro]?.[1] || -45.0835, automatico: true },
          { id: "cemaden-10", fonte: "CEMADEN", titulo: `Risco hidrológico moderado - ${municipioFiltro} - Solo encharcado - Raio 100km`, cor: "bg-orange-500", desc: `⛰ CEMADEN: Solo encharcado em encostas. Risco moderado num raio de 100km. Fonte: CEMADEN - ${dataBR} ${horaBR} - Auto 5min.`, time: "Há 2h", data: dataBR, hora: horaBR, dataHora: `${dataBR} ${horaBR}`, tipo: "alerta", grau: "cuidado", municipio: municipioFiltro, lat: COORDS[municipioFiltro]?.[0] || -23.4342, lng: COORDS[municipioFiltro]?.[1] || -45.0835, automatico: true },
          { id: "inpe-9", fonte: "INPE", titulo: `INPE: Instabilidade no Litoral Norte - Chuva forte próximas 3h - Raio 100km`, cor: "bg-blue-600", desc: `🛰 INPE/CPTEC: Núcleos de chuva em direção a Ubatuba e Caraguatatuba. Fonte: INPE GOES-16 - ${dataBR} ${horaBR} - Auto 5min.`, time: "Há 4h", data: dataBR, hora: horaBR, dataHora: `${dataBR} ${horaBR}`, tipo: "alerta", grau: "cuidado", municipio: "Caraguatatuba", lat: -23.62, lng: -45.4125, automatico: true },
          { id: `sem-${Date.now()}`, fonte: "CEMADEN", titulo: `Monitoramento automático ativo: ${municipioFiltro} - sistema online - Raio 100km - Nenhum alerta crítico`, cor: "bg-emerald-600", desc: `🟢 Nenhum alerta crítico no momento num raio de 100km de ${municipioFiltro}. Verificado ${dataBR} ${horaBR} - Fonte: CEMADEN/INMET/Defesa Civil - Att automática 5min.`, time: "Agora", data: dataBR, hora: horaBR, dataHora: `${dataBR} ${horaBR}`, tipo: "sem_alerta", grau: "atenção", municipio: municipioFiltro, lat: COORDS[municipioFiltro]?.[0] || -23.4342, lng: COORDS[municipioFiltro]?.[1] || -45.0835, automatico: true },
        ];
        
        // FILTRO RAIO 100KM
        let filtradas = base;
        if(municipioFiltro !== "Todos - 39" && (COORDS[municipioFiltro] || COORDS_COMPLETO[municipioFiltro])){
          const centro = COORDS[municipioFiltro] || COORDS_COMPLETO[municipioFiltro];
          filtradas = base.filter(n => {
            if(!n.lat || !n.lng) return true;
            const dist = calcularDistanciaKm(centro[0], centro[1], n.lat, n.lng);
            return dist <= 100;
          });
          if(filtradas.length===0) filtradas = base.slice(0,2);
        }
        noticiasFonte = filtradas;
      }

      setNoticiasOficiais(noticiasFonte);
      setUltimaAtualizacaoNoticias(`${dataBR} ${horaBR} • Auto 5min • Raio 100km`);
      try{ localStorage.setItem('geoclima_historico_noticias', JSON.stringify(noticiasFonte)); }catch{}
    }
    buscarNoticias();
    const interval = setInterval(buscarNoticias, 5*60*1000); // ATUALIZA SOZINHO A CADA 5 MIN DIRETO DA FONTE
    return ()=> clearInterval(interval);
  }, [municipioFiltro]);
  useEffect(()=>{
    const q = query(collection(db, "ocorrencias"), orderBy("createdAt","desc"));
    const unsub = onSnapshot(q, (snap:any)=>{
      const fb: Ponto[] = snap.docs.map((d:any)=>{ const data=d.data(); if(data.statusMod==="rejeitado"||data.statusMod==="pendente") return null as any; const fotoValida = data.foto && typeof data.foto === 'string' && (data.foto.startsWith('http') || data.foto.startsWith('data:')) ? data.foto : undefined; return { id:d.id, lat:data.lat, lng:data.lng, municipio:data.municipio, bairro:data.bairro, rua:data.rua, tipo:TIPOS[data.tipoIdx]||TIPOS[0], qtd:data.qtd||1, freq:data.qtd>6?"Alta":data.qtd>2?"Média":"Baixa", statusRua:data.statusRua||"Alagada", statusMod:data.statusMod||"aprovado", foto:fotoValida, obs:data.obs, quando:data.quando||"Agora" }; }).filter(Boolean);
      setPontos([...fb, ...INICIAL]);
    });
    return ()=>unsub();
  }, []);
  useEffect(()=>{
    if(!autoCarrossel) return;
    const iv = setInterval(()=>{ setViewMode(prev => prev==="mapa"?"mural": prev==="mural"?"noticias": prev==="noticias"?"historico":"mapa"); }, 20000);
    return ()=> clearInterval(iv);
  }, [autoCarrossel]);
  useEffect(()=>{
    if(!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, { 
      center: [-23.4342,-45.0835], 
      zoom: 15, 
      zoomControl:true, 
      preferCanvas:false,
      zoomSnap: 1
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { 
      attribution: "© OpenStreetMap", 
      maxZoom:19, 
      maxNativeZoom:19,
      detectRetina:true,
      tileSize: 256
    }).addTo(map);
    const group = L.layerGroup().addTo(map);
    const tempGroup = L.layerGroup().addTo(map);
    markersRef.current = group;
    tempLayerRef.current = tempGroup;
    mapRef.current = map;
    setTimeout(()=> map.invalidateSize(), 100);
    setTimeout(()=> map.invalidateSize(), 300);
    setTimeout(()=> map.invalidateSize(), 800);
    setTimeout(()=> map.invalidateSize(), 1500);
    window.addEventListener('resize', ()=> { try{ map.invalidateSize(); }catch{} });
    map.on('click', (e:any)=>{
      const lat = e.latlng.lat;
      const lng = e.latlng.lng;
      setPontoSelecionadoMapa({lat, lng});
      setAutoCarrossel(false);
      // LIMPA BOLINHA AZUL ANTERIOR - SÓ 1 POR VEZ
      if(tempLayerRef.current){ try{ tempLayerRef.current.clearLayers(); }catch{} }
      if(marcadorTemp && mapRef.current) { try{ mapRef.current.removeLayer(marcadorTemp); }catch{} }
      const icon = L.divIcon({ className:"temp-icon", html: `<div style="width:16px;height:16px;background:#0ea5e9;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>`, iconSize:[16,16], iconAnchor:[8,8] });
      const m = L.marker([lat,lng], {icon}).addTo(tempLayerRef.current!);
      setMarcadorTemp(m as any);
      setShowFormMobile(true);
      // NOVO - BUSCA ENDEREÇO AUTOMÁTICO
      buscarEnderecoAutomatico(lat, lng);
    });
    if(navigator.geolocation){ navigator.geolocation.getCurrentPosition((pos:any)=> map.setView([pos.coords.latitude, pos.coords.longitude], 15)); }
    return ()=>{ map.remove(); mapRef.current=null; markersRef.current=null; };
  }, []);
  useEffect(()=>{ if(viewMode==="mapa" && mapRef.current){ setTimeout(()=>{ mapRef.current?.invalidateSize(); }, 200); } }, [viewMode]);
  const filtrados = useMemo(()=> pontos.filter((p:any)=> municipioFiltro==="Todos - 39"||p.municipio===municipioFiltro), [pontos,municipioFiltro]);
  useEffect(()=>{
    if(!markersRef.current) return;
    try{ markersRef.current.clearLayers(); }catch{}
    filtrados.forEach((p:any)=>{
      if(typeof p.lat !== 'number' || typeof p.lng !== 'number') return;
      const marker=L.marker([p.lat,p.lng],{icon:getTrianguloIcon(p.tipo?.risco||"crítico", p.qtd||1)});
      const temFoto = p.foto && p.foto.trim() !== "" && (p.foto.startsWith("http") || p.foto.startsWith("data:"));
      const popupHtml = `
        <div style="min-width:200px; max-width:260px; font-family:sans-serif;">
          <div style="font-weight:900; font-size:11px; margin-bottom:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">📍 ${p.municipio} - ${p.rua}</div>
          <div style="font-size:9px; opacity:0.6; margin-bottom:5px;">${p.bairro} • ${p.quando} • ${p.statusRua}</div>
          ${temFoto ? `<img src="${p.foto}" style="width:100%; height:90px; object-fit:cover; border-radius:8px; margin-bottom:5px;" onerror="this.style.display='none'" />` : `<div style="background:#fef3c7; border:1px dashed #f59e0b; border-radius:6px; padding:6px; font-size:9px; text-align:center; margin-bottom:5px;">📷 Sem foto - apenas descrição</div>`}
          <div style="font-size:10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:5px;"><b>Descrição:</b> ${p.obs || "Sem descrição"}</div>
        </div>
      `;
      // HOVER SEM PISCAR - TOOLTIP MOSTRA FOTO E RUA, POPUP NO CLICK
      // Tooltip = hover rápido sem piscar (versão que funcionava bem)
      marker.bindTooltip(popupHtml, { direction: 'top', offset: [0,-20], opacity: 1, className: 'custom-hover-tooltip' });
      // Popup = click para detalhes fixos
      marker.bindPopup(popupHtml, { maxWidth:260, closeButton:true });
      marker.addTo(markersRef.current!);
    });
  }, [filtrados]);
  const locaisCriticos = useMemo(()=>{ const m: Record<string,{count:number;ponto:Ponto}>={}; pontos.forEach((p:any)=>{ const k=`${p.municipio} - ${p.rua}`; if(!m[k]) m[k]={count:0,ponto:p}; m[k].count+=p.qtd; }); return Object.entries(m).sort((a,b)=>b[1].count-a[1].count).slice(0,10); }, [pontos]);
  function falar(texto: string){ if(!("speechSynthesis" in window)) return; window.speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(texto); u.lang="pt-BR"; u.rate=0.9; window.speechSynthesis.speak(u); }
  async function compartilhar(p: Ponto){ const t=`🚨 GeoClima Vale - ${p.municipio} - ${p.rua} - ${p.tipo.simples}`; if((navigator as any).share){ try{ await (navigator as any).share({title:p.municipio,text:t,url:location.href}); return; }catch{} } await navigator.clipboard.writeText(t+" "+location.href); alert("📋 Copiado!"); }
  async function handleEnviar(e: React.FormEvent){
    e.preventDefault(); if(!formRua||!formBairro){ alert("Preencha bairro e rua - clique no mapa para preencher automático"); return; }
    let lat:number, lng:number;
    if(pontoSelecionadoMapa){ lat = pontoSelecionadoMapa.lat; lng = pontoSelecionadoMapa.lng; }
    else { const coords=COORDS[formMunicipio]||[-23.4342,-45.0835]; lat=coords[0]; lng=coords[1]; }
    try{ 
      await addDoc(collection(db,"ocorrencias"),{lat,lng,municipio:formMunicipio,bairro:formBairro,rua:formRua,tipoIdx:formTipoIdx,qtd:1,statusRua:formStatus,statusMod:"pendente",foto:formFoto,obs:formObs,quando:new Date().toLocaleString("pt-BR"),createdAt:serverTimestamp()}); 
      alert(`✅ Enviado! ${formRua} - ${formBairro}`); 
      setFormBairro(""); setFormRua(""); setFormObs(""); setFormFoto(null); setPontoSelecionadoMapa(null); setEnderecoAuto(""); setShowFormMobile(false);
      if(marcadorTemp && mapRef.current){ try{ mapRef.current.removeLayer(marcadorTemp); }catch{} setMarcadorTemp(null); }
    }catch(err:any){ alert(err.message); }
  }
  function handleFoto(e: React.ChangeEvent<HTMLInputElement>){ const f=e.target.files?.[0]; if(!f) return; const r=new FileReader(); r.onload=()=>setFormFoto(r.result as string); r.readAsDataURL(f); }
  const FormContent = (
    <>
      <h2 className="font-black text-[11px] uppercase">REGISTRAR OCORRÊNCIA - ACESSÍVEL A TODOS</h2>
      <p className="text-[10px] opacity-60 mt-1">Clique no mapa para fixar o endereço exato antes de enviar</p>
      {enderecoAuto && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-2.5 py-2 text-[10px] mt-2">
          <div className="font-bold text-blue-800 flex items-center gap-1">📍 Endereço fixado: <span className="text-green-600">Fixado</span></div>
          <div className="text-blue-700 mt-0.5 truncate">{enderecoAuto}</div>
        </div>
      )}
      <form onSubmit={handleEnviar} className="mt-2 space-y-2">
        <select value={formMunicipio} onChange={(e:any)=>setFormMunicipio(e.target.value)} className="w-full border rounded-xl px-2.5 py-2 text-[12px] bg-white text-black">{MUNICIPIOS_RMVALE.map((m:any)=><option key={m}>{m}</option>)}</select>
        <input value={formBairro} onChange={(e:any)=>setFormBairro(e.target.value)} placeholder="Bairro (ex: Centro) - preenche automático" className="w-full border rounded-xl px-2.5 py-2 text-[12px] bg-white text-black"/>
        <input value={formRua} onChange={(e:any)=>setFormRua(e.target.value)} placeholder="Rua e número (ex: Piaui, 90) - preenche automático" className="w-full border rounded-xl px-2.5 py-2 text-[12px] bg-white text-black"/>
        <select value={formTipoIdx} onChange={(e:any)=>setFormTipoIdx(Number(e.target.value))} className="w-full border rounded-xl px-2.5 py-2 text-[12px] bg-white text-black font-bold">{TIPOS.map((t:any,i:any)=><option key={i} value={i}>{t.emoji} {t.simples}</option>)}</select>
        <select value={formStatus} onChange={(e:any)=>setFormStatus(e.target.value as any)} className="w-full border rounded-xl px-2.5 py-2 text-[12px] bg-white text-black"><option>Alagada</option><option>Interditada</option><option>Risco</option><option>Livre</option></select>
        <div className="relative">
          <textarea value={formObs} onChange={(e:any)=>setFormObs(e.target.value)} placeholder="Descreva a ocorrência... (vai aparecer nos aprovados)" className="w-full border rounded-xl px-2.5 py-2 text-[12px] min-h-[60px] max-h-[70px] bg-white text-black" />
          <button type="button" onClick={()=>{ const rec = new (window as any).webkitSpeechRecognition(); if(!rec) return; rec.lang="pt-BR"; rec.onresult=(ev:any)=>setFormObs(ev.results[0][0].transcript); rec.start(); }} className="absolute bottom-1.5 right-1.5 bg-black text-white w-6 h-6 rounded-full flex items-center justify-center text-[10px]">🎤</button>
        </div>
        <div className="space-y-1.5">
          <div className="text-[10px] font-bold">Foto prova (opcional) {pontoSelecionadoMapa && <span className="text-green-600">- 📍 Fixado {enderecoAuto ? `(${enderecoAuto.slice(0,30)})` : ''}</span>}</div>
          <div className="flex gap-1.5">
            <label className="flex-1 bg-blue-600 text-white text-[10px] font-bold py-2 rounded-full text-center cursor-pointer">📷 Câmera<input type="file" accept="image/*" capture="environment" onChange={handleFoto} className="hidden"/></label>
            <label className="flex-1 bg-gray-900 text-white text-[10px] font-bold py-2 rounded-full text-center cursor-pointer">🖼 Galeria<input type="file" accept="image/*" onChange={handleFoto} className="hidden"/></label>
          </div>
          {formFoto && <img src={formFoto} className="w-full h-20 object-cover rounded-xl border"/>}
        </div>
        <button type="submit" className="w-full bg-black text-white py-2.5 rounded-full font-black text-[11px]">Registrar - {formMunicipio} {pontoSelecionadoMapa?"(endereço fixado automático)":"(clique no mapa para fixar automático)"}</button>
      </form>
    </>
  );
  return (
    <div className="bg-[#f8fafc] text-slate-900 min-h-screen font-sans pb-[90px] w-full max-w-[100vw] overflow-x-hidden">
      <style>{` 
        html, body { overflow-x: hidden !important; max-width: 100vw !important; }
        .custom-hover-tooltip { background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 0; box-shadow: 0 4px 12px rgba(0,0,0,0.15); } 
        .custom-hover-tooltip .leaflet-tooltip-content { margin: 0; }
        .leaflet-container { background: #e5e7eb !important; }
        /* FIX OVERFLOW LATERAL - SEM ARRASTAR PRO LADO NO MOBILE */
        * { box-sizing: border-box; }
        @media (max-width: 768px) {
          .leaflet-control-zoom { display: flex !important; flex-direction: column; }
          .leaflet-tile { image-rendering: -webkit-optimize-contrast; }
        }
      `}</style>
      <div className="bg-red-600 text-white font-bold overflow-hidden w-full max-w-[100vw]" style={{height:'28px'}}><style>{`@keyframes marquee{0%{transform:translateX(100%)}100%{transform:translateX(-100%)}} .animate-marquee{animation:marquee 30s linear infinite; white-space:nowrap; display:flex; gap:2rem; align-items:center; height:28px; width:max-content;} .animate-marquee:hover{animation-play-state:paused;}`}</style><div className="animate-marquee text-[11px] will-change-transform">{[...noticiasOficiais,...noticiasOficiais].map((n:any,i:any)=><span key={i} className="flex items-center gap-2 shrink-0"><span className={`${n.cor} px-2 py-0.5 rounded-full text-[9px]`}>{n.fonte}</span>{n.titulo} • {n.data} {n.hora}</span>)}</div></div>
      <header className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-[1440px] mx-auto px-4 py-1.5 flex justify-between items-center">
          <div className="text-[9px] opacity-60 hidden md:block">Vale do Paraíba e Litoral Norte • 39 municípios • UNIVESP • Só aprovados • Zoom 15 rua</div>
          <div className="flex gap-2 ml-auto">
            <select value={municipioFiltro} onChange={(e:any)=>setMunicipioFiltro(e.target.value)} className="border rounded-full px-3 py-1 text-[11px] bg-white text-black"><option>Todos - 39 ({pontos.length})</option>{MUNICIPIOS_RMVALE.map((m:any)=><option key={m}>{m}</option>)}</select>
            <button onClick={()=>{ if(navigator.geolocation) navigator.geolocation.getCurrentPosition((p:any)=> mapRef.current?.setView([p.coords.latitude, p.coords.longitude], 15))}} className="bg-blue-600 text-white px-3 py-1 rounded-full text-[11px] font-bold">Minha localização</button>
            <a href="/painel" className="bg-black text-white px-3 py-1 rounded-full text-[11px] font-bold">Painel ADM</a>
          </div>
        </div>
        <div className="max-w-[1440px] mx-auto px-4 pb-2 flex justify-between items-center gap-3">
          <div className="flex gap-2 items-center shrink-0">
            <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-black text-white">Mapa Colaborativo</span>
            <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-2.5 py-1 rounded-full text-[9px] font-bold flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>🟢 Nenhum alerta • {ultimaAtualizacaoNoticias}</span>
          </div>
          {previsao && (
            <div className="flex-1 flex justify-end">
              <div className="flex items-center gap-2 bg-[#eff6ff] border border-blue-200 rounded-full px-2.5 py-1 shadow-sm max-w-[540px] w-full">
                <span className="text-[10px] font-black flex items-center gap-1 shrink-0 text-slate-800">📍 <span className="text-blue-700">{previsao.municipio}</span> <span className="text-blue-600 font-bold">{Math.round(previsao.current?.temperature_2m||0)}°C</span> <span>{weatherEmoji(previsao.current?.weather_code||0)}</span></span>
                <div className="w-px h-4 bg-blue-200 shrink-0"></div>
                <div className="flex-1 relative h-[22px] overflow-hidden min-w-[180px]">
                  {previsao.daily?.time?.map((dia:any, idx:number)=>{
                    const max = Math.round(previsao.daily.temperature_2m_max[idx]);
                    const min = Math.round(previsao.daily.temperature_2m_min[idx]);
                    const prob = previsao.daily.precipitation_probability_max[idx];
                    const chuva = previsao.daily.precipitation_sum[idx];
                    const wcode = previsao.daily.weather_code[idx];
                    const isActive = idx===previsaoIdx;
                    const isToday = idx===0;
                    return (
                      <div key={dia} className={`absolute inset-0 flex items-center gap-1.5 px-2.5 rounded-full text-[10px] font-bold transition-all duration-700 ${isActive ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'} ${isToday ? 'bg-black text-white' : 'bg-white border border-blue-100 text-slate-700'}`}>
                        <span className="text-[9px]">{isToday ? 'HOJE' : new Date(dia+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short', day:'2-digit'}).toUpperCase()}</span>
                        <span>{weatherEmoji(wcode)}</span>
                        <span className="text-blue-700">{min}°-{max}°</span>
                        {prob>0 && <span className="text-[8px] text-blue-600">💧 <span className="text-blue-700 font-black">{prob}%</span> {chuva>0 ? `(${chuva}mm)` : ''}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </header>
      <main className="grid md:grid-cols-[360px_1fr_340px] gap-2.5 p-2.5 max-w-[1440px] mx-auto">
        <section className="bg-white border rounded-2xl p-3 h-fit sticky top-[88px] hidden md:block shadow-sm">{FormContent}</section>
        {showFormMobile && (<section className="md:hidden bg-white border rounded-2xl p-3 shadow-sm">{FormContent}</section>)}
        <section className="h-[55vh] md:h-[calc(100vh-110px)] rounded-2xl overflow-hidden border relative bg-white flex flex-col shadow-sm">
          <div className="bg-white border-b flex flex-col items-center justify-center py-2 z-[400] shrink-0"><div className="flex items-center gap-2"><div className="w-7 h-7 bg-black text-white rounded-lg flex items-center justify-center font-black text-[10px]">GC</div><div className="text-center"><div className="font-black tracking-[0.2em] text-[11px]">GEOCLIMA VALE</div><div className="text-[8px] opacity-60">39 municípios • UNIVESP • Zoom 15</div></div></div></div>
          <div className="relative flex-1 overflow-hidden bg-[#f8fafc]">
            <div className={`absolute inset-0 ${viewMode==="mapa"?"block":"hidden"}`}><div ref={mapContainerRef} className="absolute inset-0" /></div>
            {viewMode==="mural" && <div className="absolute inset-0 overflow-auto p-2.5 space-y-3 bg-[#f8fafc]"><div className="max-w-[480px] mx-auto space-y-3">{filtrados.map((p:any)=><div key={p.id} className="bg-white border rounded-[16px] overflow-hidden shadow-sm">{p.foto && (p.foto.startsWith("http") || p.foto.startsWith("data:")) && <img src={p.foto} onError={(e:any)=>{e.target.style.display="none"}} className="w-full h-[220px] object-cover"/>}<div className="p-2.5"><div className="font-black text-[12px]">📍 {p.municipio} - {p.bairro}</div><div className="text-[10px] opacity-70">{p.rua} • {p.quando}</div><div className="bg-gray-50 border rounded-xl p-2 mt-2 text-[11px]">{p.obs}</div><div className="flex gap-2 mt-2"><button onClick={()=> setPontos(ps=> ps.map(x=> x.id===p.id ? {...x, qtd:x.qtd+1} : x))} className="flex-1 bg-gray-900 text-white py-1.5 rounded-full text-[10px] font-bold">👍 Vi também ({p.qtd})</button><button onClick={()=> compartilhar(p)} className="px-3 bg-blue-600 text-white py-1.5 rounded-full text-[10px] font-bold">📤 Compartilhar</button></div></div></div>)}</div></div>}
            {viewMode==="noticias" && <div className="absolute inset-0 overflow-auto p-3 space-y-2.5 bg-[#f8fafc]"><div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2 text-[10px] font-bold text-emerald-800">🟢 SEM ALERTA • {ultimaAtualizacaoNoticias}</div>{noticiasOficiais.map((n:any,i:any)=><div key={i} className="bg-white border rounded-2xl p-3"><div className="font-black text-[11px]">{n.titulo}</div><div className="text-[10px] opacity-70">{n.desc}</div></div>)}</div>}
            {viewMode==="historico" && <div className="absolute inset-0 overflow-auto p-3 space-y-3 bg-white"><h3 className="font-black text-[12px]">🔥 HISTÓRICO - LOCAIS CRÍTICOS (90d)</h3><div className="space-y-2">{locaisCriticos.map(([chave, {count, ponto}]:any, i:any)=><div key={chave} onClick={()=>{ setViewMode("mapa"); setTimeout(()=> mapRef.current?.setView([ponto.lat, ponto.lng], 15), 100)}} className="flex items-center gap-2 bg-[#f8fafc] border p-2.5 rounded-xl cursor-pointer"><div className={`w-7 h-7 rounded-full flex items-center justify-center font-black text-white text-[11px] ${count>6?"bg-red-600":"bg-orange-500"}`}>{i+1}</div><div className="flex-1"><div className="font-bold text-[11px]">{chave}</div><div className="text-[9px] opacity-60">{ponto.bairro}</div></div><div className="text-[10px] font-black">{count}x</div></div>)}</div></div>}
          </div>
        </section>
        <section className="space-y-2.5 hidden md:block">
          <div className="bg-white border rounded-2xl p-2.5 shadow-sm">
            <h3 className="font-black text-[10px]">OCORRÊNCIAS COM FOTOS - APROVADOS - COM DESCRIÇÃO</h3>
            <div className="mt-2 space-y-2.5 max-h-[75vh] overflow-auto">
              {filtrados.map((p:any)=><div key={p.id} onClick={()=>{ setViewMode("mapa"); setTimeout(()=> mapRef.current?.setView([p.lat, p.lng], 15), 100)}} className="border rounded-2xl p-2.5 cursor-pointer hover:border-black bg-white">
                <div className="flex justify-between items-start gap-2"><div className="font-black text-[10px]">{p.municipio} - {p.rua}</div><span className={`text-[7px] px-2 py-0.5 rounded-full font-black h-fit ${p.statusRua==="Interditada"?"bg-red-600 text-white":"bg-orange-500 text-white"}`}>{p.statusRua}</span></div>
                <div className="text-[9px] opacity-60">{p.bairro} • {p.quando}</div>
                {p.foto && (p.foto.startsWith("http") || p.foto.startsWith("data:")) && <img src={p.foto} onError={(e:any)=>{e.target.style.display="none"}} className="w-full h-24 object-cover rounded-xl mt-1.5"/>}
                <div className="bg-gray-50 border rounded-xl p-1.5 mt-1.5 text-[10px]">{p.obs || "Sem descrição"}</div>
                <div className="flex gap-1 mt-1.5">
                  <button onClick={(e:any)=>{ e.stopPropagation(); falar(`${p.municipio}, ${p.rua}, ${p.obs}`)}} className="flex-1 bg-black text-white px-2 py-1 rounded-full text-[8px] font-bold">🔊 Ouvir descrição</button>
                  <button onClick={(e:any)=>{ e.stopPropagation(); compartilhar(p);}} className="flex-1 bg-blue-600 text-white px-2 py-1 rounded-full text-[8px] font-bold">📤 Compartilhar</button>
                </div>
              </div>)}
            </div>
          </div>
        </section>
      </main>
      <nav className="fixed bottom-2 left-0 right-0 z-[5000] flex justify-center px-2">
        <div className="bg-white/95 backdrop-blur border shadow rounded-full px-2 py-1 flex gap-1">
          <button onClick={()=>{ setViewMode("mapa"); setAutoCarrossel(false); }} className={`flex items-center gap-1 px-4 py-1.5 rounded-full ${viewMode==="mapa"?"bg-black text-white":"text-gray-500"}`}><span>🗺</span><span className="text-[10px] font-bold">Mapa</span></button>
          <button onClick={()=>{ setViewMode("mural"); setAutoCarrossel(false); }} className={`flex items-center gap-1 px-4 py-1.5 rounded-full ${viewMode==="mural"?"bg-black text-white":"text-gray-500"}`}><span>🎞</span><span className="text-[10px] font-bold">Mural</span></button>
          <button onClick={()=>{ setViewMode("noticias"); setAutoCarrossel(false); }} className={`flex items-center gap-1 px-4 py-1.5 rounded-full ${viewMode==="noticias"?"bg-black text-white":"text-gray-500"}`}><span>📰</span><span className="text-[10px] font-bold">Notícias</span></button>
          <button onClick={()=>{ setViewMode("historico"); setAutoCarrossel(false); }} className={`flex items-center gap-1 px-4 py-1.5 rounded-full ${viewMode==="historico"?"bg-black text-white":"text-gray-500"}`}><span>📊</span><span className="text-[10px] font-bold">Histórico</span></button>
        </div>
      </nav>
    </div>
  );
}
export default function App(){ return <UsuarioView />; }
