# ✈️ 3D Flight Radar (Global & Munich Airport Focus)

Ein interaktiver 3D-Echtzeit- und ADS-B-Flugradar mit dynamischem Level of Detail (LOD), hochauflösenden Satellitenbildern, Flugverfolgung und Ankunfts-/Abflugtafel (FIDS).

Entwickelt als interaktives Geodaten- und WebGL/Three.js-Portfolio-Projekt.

---

## 🌟 Features

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

## ⚖️ Datenquellen, Lizenzen & Rechtliche Prüfung

Alle in diesem Projekt genutzten Daten und Schnittstellen wurden rechtlich geprüft und sind für nicht-kommerzielle, akademische Portfolio- und Demonstrationszwecke freigegeben:

| Datenbereich | Quelle | Lizenz & Nutzungsbedingungen |
|---|---|---|
| **Flugverkehrsdaten (ADS-B)** | [The OpenSky Network](https://opensky-network.org) | Nicht-kommerzielle Forschung, akademische Nutzung & Portfolio-Demonstrationen mit Quellennennung gestattet. |
| **Satellitenbilder (High-Res LOD)** | [Esri World Imagery](https://server.arcgisonline.com) | Esri, Maxar, Earthstar Geographics, CNES/Airbus DS, USDA FSA, USGS, IGN, IGP & GIS User Community. Freie Ansicht für Bildungs- und Portfolio-Websites. |
| **Globus-Texturen** | [NASA Earth Observatory](https://visibleearth.nasa.gov) | Blue Marble & GEBCO Bathymetry – Gemeinfrei (Public Domain nach US Copyright Law). |
| **Globale Wolkendecke** | [Matt Eason Clouds API](https://clouds.matteason.co.uk) | Aggregiert aus NOAA, EUMETSAT & JMA Daten – Creative Commons Attribution (CC-BY). |
| **Flughafendatenbank** | [OurAirports](https://ourairports.com) & OpenFlights | Open Database License (ODbL) / Public Domain (CC0). |

---

## 🚀 Lokale Nutzung

Da moderne Browser aus Sicherheitsgründen die Ausführung von JavaScript-ES-Modulen über das lokale `file://`-Protokoll einschränken (CORS-Sicherheitsrichtlinie), empfiehlt sich ein lokaler HTTP-Server:

```bash
# Mit Node.js (npx)
npx serve .

# Oder mit Python 3
python -m http.server 8085
```

Öffnen Sie anschließend [http://localhost:8085](http://localhost:8085) im Browser.

---

## 🌐 GitHub Pages Deployment

Das Repository ist mit GitHub Actions für automatische Bereitstellung auf GitHub Pages konfiguriert (`.github/workflows/deploy.yml`).

1. Repository auf GitHub anlegen (`flight-radar-3d`).
2. Unter **Settings $\rightarrow$ Pages $\rightarrow$ Build and deployment** die Source auf **GitHub Actions** einstellen.
3. Code pushen – die Bereitstellung erfolgt vollautomatisch.

---

## 📜 Lizenz

Dieses Projekt ist unter der [MIT License](LICENSE) lizenziert.
