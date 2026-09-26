# GeoClima Vale - Sistema Colaborativo de Monitoramento de Pontos com Histórico de Obstrução
### PI II UNIVESP - Vale do Paraíba e Litoral Norte (39 municípios) - Entrega CEMADEN

**Status:** Protótipo validado para Parque Tecnológico SJC

#### Como rodar (VS Code)
1. Clone: `git clone https://github.com/SEU-ORG/geoclima-vale.git`
2. Entre na pasta: `cd pi-geoclima`
3. Instale: `npm install`
4. Copie env: `cp .env.example .env` e coloque suas chaves Supabase
5. Rode: `npm run dev` -> http://localhost:5173

#### Estrutura de interfaces separadas (requisito orientadora)
- 👤 **Área do Morador**: interface limpa, séria, dinâmica, sem poluição - mapa + registrar ponto com dropdown dual (cognitivo + técnico CEMADEN)
- 🛡️ **Área Técnica CEMADEN**: dashboard escuro, tabela validação, estações pluviométricas, filtros

#### Dropdown Dual (simples + técnico)
Ex: 🕳️ Bueiro entupido / tampado (morador) → Técnico CEMADEN: Bueiro obstruído

#### Frequência (não risco - requisito jurídico)
- Alta Frequência: 10+ registros / 90 dias
- Média: 4-9 / 90d
- Baixa: 1-3 / 90d
Não emite alerta preditivo.

#### Time
- UNIVESP - Polo Ubatuba - Orientadora Beatriz
- Fonte: INMET / GOES-16 / CEMADEN - dados públicos