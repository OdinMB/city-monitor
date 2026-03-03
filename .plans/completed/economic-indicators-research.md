# Economic Indicators Data Sources Research (2026-03-03)

Research into publicly available economic indicator data (unemployment, wages, income, job market) at district/neighborhood level for Berlin, Germany. Focus on data suitable for choropleth map overlays showing economic health per district.

---

## 1. Monitoring Soziale Stadtentwicklung (MSS) 2023 — BEST SOURCE FOR CHOROPLETH

The single best source for district-level economic/social indicators in Berlin. Published by the Senate Administration for Urban Development, Building and Housing. Contains unemployment, transfer benefits, and social inequality indices at the finest geographic granularity available (down to 542 planning areas).

### Direct XLSX Downloads

| File | Content | Granularity | URL |
|---|---|---|---|
| `1sdi_mss2023.xlsx` (52.8 kB) | Social Inequality Index (Status/Dynamic) 2023 | 542 Planungsräume | `https://www.berlin.de/sen/sbw/_assets/stadtdaten/stadtwissen/monitoring-soziale-stadtentwicklung/bericht-2023/1sdi_mss2023.xlsx` |
| `21indexind_anteile_plr_mss2023.xlsx` (88.0 kB) | Index indicators — percentage shares | 542 Planungsräume | `https://www.berlin.de/sen/sbw/_assets/stadtdaten/stadtwissen/monitoring-soziale-stadtentwicklung/bericht-2023/21indexind_anteile_plr_mss2023.xlsx` |
| `22indexind_anteile_bzr_mss2023_kor.xlsx` (45.3 kB) | Index indicators — percentage shares | 143 Bezirksregionen | `https://www.berlin.de/sen/sbw/_assets/stadtdaten/stadtwissen/monitoring-soziale-stadtentwicklung/bericht-2023/22indexind_anteile_bzr_mss2023_kor.xlsx` |
| `23indexind_anteile_bezirke_mss2023_kor.xlsx` (22.2 kB) | Index indicators — percentage shares | 12 Bezirke | `https://www.berlin.de/sen/sbw/_assets/stadtdaten/stadtwissen/monitoring-soziale-stadtentwicklung/bericht-2023/23indexind_anteile_bezirke_mss2023_kor.xlsx` |

### WFS Endpoint (GeoJSON-capable)

- **URL:** `https://gdi.berlin.de/services/wfs/mss_2023`
- **GetCapabilities:** `https://gdi.berlin.de/services/wfs/mss_2023?request=GetCapabilities&service=WFS`
- **Format:** OGC WFS (supports GeoJSON output via `outputFormat=application/json`)
- **Contains geometry:** Yes — polygons for each planning area, perfect for choropleth rendering

### Data Fields (4 Index Indicators + 19 Context Indicators)

**Index Indicators:**
| Indicator | Description |
|---|---|
| Arbeitslosigkeit (SGB II) | Proportion of unemployed under SGB II among working-age population |
| Transferbezug (SGB II/XII) | Non-employed transfer benefit recipients |
| Kinderarmut | Children under 15 in SGB II benefit households |
| Alleinerziehende | Children in single-parent households |

**Context Indicators (19 total):** Include demographics, migration, housing, education, and additional socioeconomic factors.

### Metadata
- **Data period:** Dec 31, 2020 – Dec 31, 2022
- **LOR version:** Jan 2023
- **License:** Datenlizenz Deutschland – Zero – Version 2.0 (dl-de-zero-2.0) — completely free, no attribution required
- **Geographic granularity:** 542 Planungsräume / 143 Bezirksregionen / 12 Bezirke
- **Update frequency:** Every 2 years (biennial report)
- **Portal page:** https://daten.berlin.de/datensaetze/monitoring-soziale-stadtentwicklung-mss-2023-wfs-078ba40c
- **Report page:** https://www.berlin.de/sen/sbw/stadtdaten/stadtwissen/monitoring-soziale-stadtentwicklung/bericht-2023/

### Choropleth Suitability: EXCELLENT
- Has geometry via WFS
- Granularity down to 542 planning areas
- Unemployment rate (SGB II) is the primary indicator
- Standardized z-values available for comparison
- Free license, no attribution required

---

## 2. Gesundheits- und Sozialstrukturatlas Berlin 2022 (GSSA) — HEALTH + SOCIAL INDEX

Published by the Senate Health Administration. A composite index of 20 indicators across employment, social circumstances, and health.

### Direct CSV Download

- **URL:** `https://www.berlin.de/sen/gesundheit/_assets/daten/gesundheits-und-sozialstrukturatlas/gssa_2022_planungsraeume.csv`
- **Format:** CSV
- **Granularity:** Planungsräume (planning areas)

### Data Fields
Three sub-indices combine into an overall "Gesundheits- und Sozialindex (GESIx)":
1. **Employment sub-index** — unemployment-related indicators
2. **Social situation sub-index** — transfer benefits, income-related
3. **Health sub-index** — health outcome indicators

### Metadata
- **License:** Creative Commons Attribution (CC-BY) — attribution to "Senatsverwaltung für Wissenschaft, Gesundheit, Pflege und Gleichstellung Berlin - I A"
- **Last updated:** July 21, 2025
- **Original publication:** March 29, 2022
- **Geographic granularity:** Planungsräume
- **Portal page:** https://daten.berlin.de/datensaetze/gesundheits-und-sozialstrukturatlas-berlin-2022-indexwerte-auf-ebene-der-planungsraeume

Also available at Bezirksregion and Bezirk level:
- **Bezirke:** https://daten.berlin.de/datensaetze/gesundheits-und-sozialstrukturatlas-berlin-2022-indexwerte-auf-ebene-der-bezirke-1190882
- **Bezirksregionen:** https://daten.berlin.de/datensaetze/gesundheits-und-sozialstrukturatlas-berlin-2022-indexwerte-auf-ebene-der-bezirksregionen-119115

### Choropleth Suitability: GOOD
- CSV format is easy to parse
- Needs separate LOR geometry file for map rendering
- Composite health+social index useful as single "economic health" metric

---

## 3. Bundesagentur für Arbeit (BA) — Statistics API — UNEMPLOYMENT + EMPLOYMENT

The Federal Employment Agency launched a REST API in December 2025 providing labor market key figures.

### API Endpoints

**Employment Key Figures (Eckwerte Beschäftigung):**
| Format | URL |
|---|---|
| CSV | `https://statistik-dr.arbeitsagentur.de/bifrontend/bids-api/ct/v1/tableFetch/csv/` |
| XLSX | `https://statistik-dr.arbeitsagentur.de/bifrontend/bids-api/ct/v1/tableFetch/xlsx/` |
| JSON | `https://statistik-dr.arbeitsagentur.de/bifrontend/bids-api/pc/v1/tableFetch/dia/` |

**Query syntax:** Append `EckwerteTabelleBST?[Region Type] AO=[Region Name]`
- Example: `?Bundesland AO=Berlin`

### Geographic Levels
1. Deutschland (national)
2. Bundesländer (federal states)
3. Kreise und kreisfreie Städte (districts) — **Berlin is a single Kreis (code 11000)**
4. Agenturbezirke (employment agency districts)
5. Arbeitsmarktregionen (labor market regions)

### Data Fields
- Total employees subject to social security contributions
- Exclusively marginally employed
- Month-over-month and year-over-year changes
- Additional datasets planned: unemployment, underemployment, training market, SGB II, job vacancies

### Metadata
- **Auth:** No authentication documented
- **License:** Not explicitly stated; government open data
- **Update frequency:** Monthly
- **Status:** Pilot program (December 2025); expansion planned
- **Docs:** https://statistik.arbeitsagentur.de/DE/Navigation/Service/API/API-Start-Nav.html
- **Employment API docs:** https://statistik.arbeitsagentur.de/DE/Statischer-Content/Service/API/API-BST.html

### Limitation for Berlin Districts
Berlin is treated as a single Kreis (city-state) in the BA system. Sub-district (Bezirk) unemployment data is NOT available via this API. Jobcenter areas partially map to Bezirke, but the API does not yet expose unemployment endpoints.

### Choropleth Suitability: LIMITED
- Only city-level for Berlin (no per-Bezirk breakdown via API)
- Useful for Berlin vs. other cities comparison
- Monthly updates are valuable for time series

---

## 4. Entgeltatlas API — MEDIAN WAGES BY OCCUPATION

The BA's Entgeltatlas provides median gross monthly wages by occupation, region, gender, age, and industry.

### API Endpoint

**Base:** `https://rest.arbeitsagentur.de/infosysbub/entgeltatlas/pc/v1/entgelte/{KldB-Code}`

### Authentication
- **OAuth 2 Client Credentials:**
  - `client_id`: `c4f0d292-9d0f-4763-87dd-d3f9e78fb006`
  - `client_secret`: `566c4dd6-942f-4cda-aad6-8d611c577107`
  - Token endpoint: `https://rest.arbeitsagentur.de/oauth/gettoken_cc`
- **Alternative:** Pass `client_id` as `X-API-Key` header directly

### Query Parameters
| Param | Values | Meaning |
|---|---|---|
| `l` | 1-4 | Performance level: Helper, Skilled, Specialist, Expert |
| `r` | 1-30 | Region (14 = Berlin) |
| `g` | 1-3 | Gender: All, Male, Female |
| `a` | 1-4 | Age: All, <25, 25-55, 55+ |
| `b` | 1-11 | Industry sector |

### Region Codes (selection)
| Code | Region |
|---|---|
| 1 | Germany |
| 5 | Hamburg |
| 14 | **Berlin** |
| 15 | Brandenburg |

### Reference Endpoints
- `/regionen` — list all region codes
- `/geschlechter` — gender codes
- `/alter` — age group codes
- `/branchen` — industry sector codes

### Metadata
- **Format:** JSON
- **License:** Not explicitly stated; public credentials suggest open use
- **Geographic granularity:** State-level and major cities only (not per-Bezirk)
- **Update frequency:** Annual
- **GitHub docs:** https://github.com/AndreasFischer1985/entgeltatlas-api
- **Official tool:** https://web.arbeitsagentur.de/entgeltatlas/

### Choropleth Suitability: NOT SUITABLE
- State-level only (Berlin as single region)
- No per-district wage data
- Useful for context: "average wages in Berlin for occupation X"

---

## 5. Regionalatlas Deutschland API — REGIONAL INDICATORS (160+)

The Regionalatlas provides 160+ pre-computed indicators at the district (Kreis) level via an ArcGIS REST endpoint.

### API Endpoint

**Base:** `https://www.gis-idmz.nrw.de/arcgis/rest/services/stba/regionalatlas/MapServer/dynamicLayer/query`

### Example Query (Unemployment Rate for Berlin)
```
https://www.gis-idmz.nrw.de/arcgis/rest/services/stba/regionalatlas/MapServer/dynamicLayer/query?
  layer={"source":{"dataSource":{"geometryType":"esriGeometryPolygon","workspaceId":"gdb",
  "query":"SELECT * FROM verwaltungsgrenzen_gesamt LEFT OUTER JOIN ai008_1_5 ON ags = ags2 and jahr = jahr2 WHERE typ = 3 AND jahr = 2023"}},
  "type":"dataLayer"}&
  outFields=*&
  where=ags2 LIKE '11%'&
  f=json
```

### Key Economic Indicator Codes
| Table Code | Indicator Code | Description |
|---|---|---|
| `AI008-1-5` | `AI0801` | Unemployment rate (all) |
| `AI008-1-5` | `AI0802` | Unemployment rate (men) |
| `AI008-1-5` | `AI0803` | Unemployment rate (women) |
| `AI008-1-5` | `AI0804` | Unemployment rate (15-24) |
| `AI008-1-5` | `AI0805` | Unemployment rate (55-64) |
| `AI009-1-5` | `AI0901` | GDP per capita |
| `AI009-1-5` | `AI0902` | GDP per employed person |
| `AI-S-12` | `AI_S12` | Disposable income per capita |

### Service Index
All available tables/indicators: `https://regionalatlas.statistikportal.de/taskrunner/services.json`

### Geographic Levels (via `typ` parameter)
| typ | Level |
|---|---|
| 1 | Bundesländer (states) |
| 2 | Regierungsbezirke (government districts) |
| 3 | Kreise und kreisfreie Städte (districts) |
| 5 | Gemeinden/Gemeindeverbände (municipalities) |

### Metadata
- **Format:** JSON (ArcGIS REST)
- **Auth:** None
- **License:** Datenlizenz Deutschland – Namensnennung – Version 2.0 (dl-de-by-2.0)
- **Update frequency:** Annual (varies by indicator)
- **Web viewer:** https://regionalatlas.statistikportal.de/
- **GitHub docs:** https://github.com/bundesAPI/regionalatlas-api

### Limitation for Berlin Districts
Berlin = 1 Kreis (AGS 11000). The Regionalatlas does NOT break Berlin into Bezirke — it treats the entire city as a single unit.

### Choropleth Suitability: LIMITED
- Only city-level for Berlin
- Good for comparing Berlin to other German Kreise
- Includes geometry in response (ArcGIS polygon)
- 160+ indicators available

---

## 6. GENESIS / Regionalstatistik.de — COMPREHENSIVE STATISTICAL DATABASE

The official statistical databases of Germany, providing granular regional data.

### API Base URLs

| Database | Base URL | Scope |
|---|---|---|
| GENESIS-Online (Destatis) | `https://www-genesis.destatis.de/genesisWS/rest/2020` | Federal statistics |
| Regionalstatistik.de | `https://www.regionalstatistik.de/genesisWS/rest/2020` | Regional (Länder) statistics |

### Key Endpoints
| Endpoint | Method | Description |
|---|---|---|
| `/find/find` | POST | Search for tables by keyword |
| `/data/table` | POST | Retrieve table data |
| `/data/timeseries` | POST | Time series data |
| `/catalogue/tables` | POST | List available tables |
| `/metadata/table` | POST | Table metadata |

### Relevant Table Codes
| Code | Description | Source |
|---|---|---|
| 13211 | Labor market statistics (BA) — unemployment by Kreis | Regionalstatistik |
| 13111 | Employees subject to social security — by Kreis | Regionalstatistik |
| 12251 | Microcensus labor market data | Regionalstatistik |

### Authentication
- **Registration:** Free, required since May 2025
- **Default guest:** username=`GAST`, password=`GAST` (limited access)
- **Method:** POST only (GET discontinued Nov 2025)

### Response Formats
- JSON (default)
- Flat-file CSV ("tidy data")
- XLSX

### Metadata
- **License:** Datenlizenz Deutschland – Namensnennung – Version 2.0
- **Docs PDF:** https://daten.statistik-bw.de/genesisonline/misc/GENESIS-Webservices_Einfuehrung.pdf
- **Registration:** https://www.regionalstatistik.de/genesis/online (free account)
- **Update frequency:** Monthly (unemployment), annual (income/wages)

### Limitation for Berlin Districts
Same as above: Berlin = 1 Kreis. No sub-city breakdown available.

### Choropleth Suitability: NOT SUITABLE for Berlin Bezirk map
- City-level only for Berlin
- Good for national/regional comparison dashboards

---

## 7. LOR Geometry Data — REQUIRED FOR CHOROPLETH RENDERING

To render any of the above data as a choropleth, you need the LOR (Lebensweltlich orientierte Räume) geometry boundaries.

### WFS Endpoints (GeoJSON output)

| Level | WFS URL |
|---|---|
| Planungsräume (542) | `https://gdi.berlin.de/services/wfs/lor_planungsraeume_2021` |
| Bezirksregionen (143) | `https://gdi.berlin.de/services/wfs/lor_bezirksregionen_2021` |
| Prognoseräume (58) | `https://gdi.berlin.de/services/wfs/lor_prognoseraeume_2021` |

**Example GeoJSON request:**
```
https://gdi.berlin.de/services/wfs/lor_planungsraeume_2021?
  service=WFS&version=2.0.0&request=GetFeature&
  typeNames=lor_planungsraeume_2021&
  outputFormat=application/json&
  srsName=EPSG:4326
```

### Alternative Sources
- **Berlin Open Data:** https://daten.berlin.de/datensaetze/lebensweltlich-orientierte-raeume-in-berlin
- **Formats available:** GeoJSON, GML, KML, ESRI Shapefile, SQLite
- **GitHub (Funke):** https://github.com/funkeinteraktiv/Berlin-Geodaten
- **License:** dl-de-zero-2.0 (no attribution required)

### Note on MSS 2023 WFS
The MSS 2023 WFS at `https://gdi.berlin.de/services/wfs/mss_2023` already includes geometry + indicator data combined, so no separate join is needed if using that endpoint.

---

## Summary & Recommendations

### For Berlin District Choropleth Map

| Priority | Source | Data | Granularity | Format | Update | License |
|---|---|---|---|---|---|---|
| **1st** | MSS 2023 WFS | Unemployment (SGB II), transfer benefits, child poverty, social inequality index | 542 PLR / 143 BZR / 12 Bezirke | WFS (GeoJSON) + XLSX | Biennial | dl-de-zero-2.0 (free) |
| **2nd** | GSSA 2022 CSV | Composite social+economic+health index | Planungsräume | CSV | ~Every 3 years | CC-BY |
| **3rd** | BA Statistics API | Employment figures (city-level) | Berlin as whole | CSV/JSON | Monthly | Open |
| **4th** | Entgeltatlas API | Median wages by occupation | Berlin as whole | JSON | Annual | Open (public creds) |
| **5th** | Regionalatlas API | 160+ indicators (GDP, unemployment rate, income) | Berlin as whole (Kreis) | JSON (ArcGIS) | Annual | dl-de-by-2.0 |
| **6th** | Regionalstatistik API | Detailed statistical tables | Berlin as whole (Kreis) | CSV/JSON | Monthly/Annual | dl-de-by-2.0 |

### Key Finding
**Sub-city economic data for Berlin is only available through Berlin-specific sources** (MSS, GSSA), not through federal sources (BA, Destatis, Regionalatlas). Federal sources treat Berlin as a single Kreis.

### Recommended Implementation Approach

1. **Primary layer:** Use MSS 2023 WFS endpoint (`gdi.berlin.de/services/wfs/mss_2023`) — it has geometry + data combined, supports GeoJSON output, and uses the most permissive license (dl-de-zero-2.0). Display unemployment rate (SGB II) and social inequality index per Planungsraum or Bezirksregion.

2. **Supplementary:** Parse the GSSA 2022 CSV for the composite health/social index and join with LOR geometry.

3. **City-level context:** Use the BA Statistics API or Regionalatlas for Berlin-wide unemployment rate trends (monthly time series).

4. **Wage context:** Use the Entgeltatlas API for Berlin-wide median wage data by occupation sector.

### Data Freshness Concern
The MSS data (observation period 2020-2022) and GSSA (2022) are the most granular but are published on multi-year cycles. There is no live/monthly sub-district unemployment data source for Berlin available via API. The BA publishes monthly Jobcenter-area reports as PDF/XLSX via their portal, but these are not machine-readable APIs.

### Berlin Bezirk ↔ Jobcenter Mapping
Berlin has 12 Jobcenters that correspond to the 12 Bezirke. The BA publishes monthly "Arbeitsmarktreport" PDFs for each Jobcenter. These contain per-Bezirk unemployment rates but are in PDF format, not API-accessible. The XLSX mapping file is available at:
`https://statistik.arbeitsagentur.de/DE/Statischer-Content/Grundlagen/Klassifikationen/Regionale-Gliederungen/Generische-Publikationen/Zuordnung-Jobcenter.xlsx`
