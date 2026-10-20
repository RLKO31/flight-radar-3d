# 3D Flight Radar (Global & Munich Airport Focus)

[![GitHub Pages](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-brightgreen?logo=github)](https://RLKO31.github.io/flight-radar-3d/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Three.js](https://img.shields.io/badge/3D-Three.js-000000?logo=three.js)](https://threejs.org/)

[English](#english-version) | [Deutsch](#deutsche-version)

---

## English Version

An interactive 3D real-time and ADS-B flight radar application featuring dynamic Level-of-Detail (LOD), high-resolution satellite imagery, flight tracking, and airport arrival/departure display boards (FIDS).

Developed as an interactive geospatial data and WebGL/Three.js academic portfolio project at the **Technical University of Applied Sciences Würzburg-Schweinfurt (THWS)**.

**Live Website:** [https://RLKO31.github.io/flight-radar-3d/](https://RLKO31.github.io/flight-radar-3d/)

---

### Key Features

- **Interactive 3D Earth Globe (Three.js):**
  - Textured with NASA Blue Marble, specular ocean reflections, and topographic elevation relief.
  - Dynamic global cloud coverage (real-time satellite imagery via Matt Eason / EUMETSAT with local fallback).
- **Seamless Level-of-Detail (LOD) Satellite Imagery:**
  - Multi-resolution tile pyramid (Zoom levels 11, 13, 16) powered by Esri World Imagery.
  - Orthorectified and centered tile alignment eliminating distortion or scaling artifacts.
  - Soft radial alpha blending for seamless integration into the 3D globe surface.
- **Flight Traffic & ADS-B Tracking:**
  - Supports live OpenSky Network ADS-B feeds alongside an automated ADS-B flight replay engine containing over 6,200 real aircraft states.
  - Dynamic aircraft category recognition (Light aircraft, Mid-range jets, Heavy jumbos, Military jets).
  - Interpolated flight trails with altitude and speed color gradients.
- **Interactive Control Center & HUD:**
  - **FIDS Board:** Departures & Arrivals with flight numbers, airlines, routes, and operational status.
  - **Detailed Aircraft Inspection:** Clicking an aircraft reveals airline, calculated distance, registration country, vertical speed, altitude, velocity, heading, and ICAO24 address.
  - **Camera Tracking (Track Flight):** Smoothly locks camera position and orientation to follow selected flights in 3D space.
  - **Global Airport Quick Select:** Fast camera focus on Munich (EDDM), Frankfurt (EDDF), London Heathrow (EGLL), New York (KJFK), Tokyo Haneda (RJTT), and over 7,900 additional airports.
- **Legal Compliance & Transparency:**
  - Built-in legal notice conforming to German Telemedia law (§ 5 DDG & § 18 Abs. 2 MStV).
  - Transparent attribution of all data sources, licensing terms, and privacy disclosures.

---

### Data Sources, Credits & Legal Assessment

All data sources and interfaces utilized in this project have been legally vetted and are authorized for non-commercial, academic portfolio and educational demonstration purposes:

| Data Scope | Source / Provider | License & Terms |
|---|---|---|
| **Flight Traffic Data (ADS-B)** | [The OpenSky Network](https://opensky-network.org) | Authorized for non-commercial research, academic study, and portfolio demos with attribution. |
| **Satellite Imagery (High-Res LOD)** | [Esri World Imagery](https://server.arcgisonline.com) | Esri, Maxar, Earthstar Geographics, CNES/Airbus DS, USDA FSA, USGS, IGN, IGP, and GIS User Community. Free for educational display. |
| **Globe Basemap Textures** | [NASA Earth Observatory](https://visibleearth.nasa.gov) | Blue Marble & GEBCO Bathymetry - Public Domain under US Copyright Law. |
| **Global Cloud Layer** | [Matt Eason Clouds API](https://clouds.matteason.co.uk) | Aggregated from NOAA, EUMETSAT & JMA feeds - Creative Commons Attribution (CC-BY). |
| **Airport Database** | [OurAirports](https://ourairports.com) & OpenFlights | Open Database License (ODbL) / Public Domain (CC0). |

---

### Local Execution

Modern web browsers enforce CORS security restrictions when loading JavaScript ES modules over the local `file://` protocol. A lightweight local HTTP server is recommended:

```bash
# Using Node.js (npx)
npx serve .

# Or using Python 3
python -m http.server 8085
```

Then navigate to [http://localhost:8085](http://localhost:8085) in your browser.

---

### GitHub Pages Deployment

The repository is pre-configured with a GitHub Actions workflow for automatic deployment to GitHub Pages (`.github/workflows/deploy.yml`).

1. Create a repository on GitHub (`flight-radar-3d`).
2. In **Settings -> Pages -> Build and deployment**, set the Source to **GitHub Actions**.
3. Push to `main` - deployment runs fully automated.

---

### License

This project is licensed under the [MIT License](LICENSE).

---

## Deutsche Version

Ein interaktiver 3D-Echtzeit- und ADS-B-Flugradar mit dynamischem Level of Detail (LOD), hochauflösenden Satellitenbildern, Flugverfolgung und Ankunfts-/Abflugtafel (FIDS).

Entwickelt als interaktives Geodaten- und WebGL/Three.js-Portfolio-Projekt an der **Technischen Hochschule Würzburg-Schweinfurt (THWS)**.

**Live-Webseite:** [https://RLKO31.github.io/flight-radar-3d/](https://RLKO31.github.io/flight-radar-3d/)

---

### Features

- **Interaktiver 3D-Globus (Three.js):**
  - Texturiert mit NASA Blue Marble, Ozean-Spiegelungen (Specular Mapping) und Relief-Topografie.
  - Dynamische globale Wolkendecke (Echtzeit-Satellitenbilder via Matt Eason / EUMETSAT mit lokalem Fallback).
- **Nahtlose Level-of-Detail (LOD) Satellitenbilder:**
  - Mehrstufige Kachelpyramide (Zoom 11, 13, 16) basierend auf Esri World Imagery.
  - Orthorektifizierte und zentrierte Kachelausrichtung ohne Verzerrungen oder Skalierungsfehler.
  - Weiche radiale Alpha-Maskierung für fließenden Übergang in den 3D-Globus.
- **Flugverkehr & ADS-B Tracking:**
  - Unterstützung für OpenSky Network Live-ADS-B-Daten sowie automatische ADS-B-Replay-Engine mit über 6.200 realen Flugzuständen.
  - Dynamische Erkennung von Flugzeugkategorien (Leichtflugzeuge, Mittelstreckenjets, Heavy Jumbos, Militärjets).
  - Flugpfade (Trails) mit Höhen- und Geschwindigkeitsinterpolation.
- **Interaktives Kontrollzentrum & HUD:**
  - **FIDS-Tafel:** Starts & Landungen mit Flugnummer, Fluggesellschaft, Route und Status.
  - **Detaillierte Flug-Inspektion:** Klick auf Flugzeuge zeigt Fluggesellschaft, berechnete Flugstrecke, Registrierungsland, Steig-/Sinkrate, Höhe, Geschwindigkeit, Steuerkurs und ICAO24-Adresse.
  - **Kamera-Verfolgung (Track Flight):** Die Kamera heftet sich an ausgewählte Flugzeuge und folgt ihnen im 3D-Raum.
  - **Weltweite Flughafenauswahl:** Schnellfokus auf München (EDDM), Frankfurt (EDDF), London (EGLL), New York (KJFK), Tokio (RJTT) und über 7.900 weitere Flughäfen.
- **Rechtssicherheit & Transparenz:**
  - Integriertes Impressum gemäß § 5 DDG & § 18 Abs. 2 MStV.
  - Transparente Offenlegung aller Datenquellen, Lizenzen und Datenschutzhinweise.

---

### Datenquellen, Lizenzen & Rechtliche Prüfung

Alle in diesem Projekt genutzten Daten und Schnittstellen wurden rechtlich geprüft und sind für nicht-kommerzielle, akademische Portfolio- und Demonstrationszwecke freigegeben:

| Datenbereich | Quelle | Lizenz & Nutzungsbedingungen |
|---|---|---|
| **Flugverkehrsdaten (ADS-B)** | [The OpenSky Network](https://opensky-network.org) | Nicht-kommerzielle Forschung, akademische Nutzung & Portfolio-Demonstrationen mit Quellennennung gestattet. |
| **Satellitenbilder (High-Res LOD)** | [Esri World Imagery](https://server.arcgisonline.com) | Esri, Maxar, Earthstar Geographics, CNES/Airbus DS, USDA FSA, USGS, IGN, IGP & GIS User Community. Freie Ansicht für Bildungs- und Portfolio-Websites. |
| **Globus-Texturen** | [NASA Earth Observatory](https://visibleearth.nasa.gov) | Blue Marble & GEBCO Bathymetry – Gemeinfrei (Public Domain nach US Copyright Law). |
| **Globale Wolkendecke** | [Matt Eason Clouds API](https://clouds.matteason.co.uk) | Aggregiert aus NOAA, EUMETSAT & JMA Daten – Creative Commons Attribution (CC-BY). |
| **Flughafendatenbank** | [OurAirports](https://ourairports.com) & OpenFlights | Open Database License (ODbL) / Public Domain (CC0). |

---

### Lokale Nutzung

Da moderne Browser aus Sicherheitsgründen die Ausführung von JavaScript-ES-Modulen über das lokale `file://`-Protokoll einschränken (CORS-Sicherheitsrichtlinie), empfiehlt sich ein lokaler HTTP-Server:

```bash
# Mit Node.js (npx)
npx serve .

# Oder mit Python 3
python -m http.server 8085
```

Öffnen Sie anschließend [http://localhost:8085](http://localhost:8085) im Browser.

---

### GitHub Pages Deployment

Das Repository ist mit GitHub Actions für automatische Bereitstellung auf GitHub Pages konfiguriert (`.github/workflows/deploy.yml`).

1. Repository auf GitHub anlegen (`flight-radar-3d`).
2. Unter **Settings -> Pages -> Build and deployment** die Source auf **GitHub Actions** einstellen.
3. Code pushen – die Bereitstellung erfolgt vollautomatisch.

---

### Lizenz

Dieses Projekt ist unter der [MIT License](LICENSE) lizenziert.
