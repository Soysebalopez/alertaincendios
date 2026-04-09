"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface FirePoint {
  latitude: number;
  longitude: number;
  confidence: string;
  frp: number;
}

export function FireMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, {
      center: [-38, -64],
      zoom: 5,
      zoomControl: false,
      attributionControl: false,
    });

    // Dark tile layer
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      { maxZoom: 18 }
    ).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    mapInstance.current = map;

    // Fetch fires from our cached API
    fetch("/api/fires")
      .then((r) => r.json())
      .then((data) => {
        const fires: FirePoint[] = data.fires || [];
        fires.forEach((f) => {
          const radius = Math.max(3, Math.min(8, f.frp / 5));
          const opacity = f.confidence === "h" || f.confidence === "high" ? 0.9 : 0.6;

          L.circleMarker([f.latitude, f.longitude], {
            radius,
            color: "#e8622c",
            fillColor: "#ef4444",
            fillOpacity: opacity,
            weight: 1,
          })
            .bindPopup(
              `<div style="font-family:monospace;font-size:12px;color:#1a1a17">
                <b>Foco de calor</b><br/>
                Lat: ${f.latitude.toFixed(4)}<br/>
                Lng: ${f.longitude.toFixed(4)}<br/>
                FRP: ${f.frp} MW<br/>
                Confianza: ${f.confidence}
              </div>`
            )
            .addTo(map);
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="w-full h-full" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60">
          <span className="font-mono text-xs text-muted animate-pulse">
            Cargando focos...
          </span>
        </div>
      )}
    </div>
  );
}
