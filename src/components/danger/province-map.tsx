"use client";
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { dangerColor, provinceBbox, type ProvinceDanger } from "@/lib/fire-danger";

export function ProvinceMap({
  data,
  selectedDay,
  showDetection,
}: {
  data: ProvinceDanger;
  selectedDay: number;
  showDetection: boolean;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const zonesLayer = useRef<L.LayerGroup | null>(null);
  const firesLayer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!elRef.current) return;
    const [s, n, w, e] = provinceBbox(data.zones);
    const map = L.map(elRef.current, { zoomControl: false, attributionControl: false });
    map.fitBounds([[s, w], [n, e]], { padding: [24, 24] });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", { maxZoom: 18 }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    zonesLayer.current = L.layerGroup().addTo(map);
    firesLayer.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      zonesLayer.current = null;
      firesLayer.current = null;
    };
  }, [data]);

  useEffect(() => {
    const layer = zonesLayer.current;
    if (!layer) return;
    layer.clearLayers();
    for (const z of data.zones) {
      const day = z.forecast[selectedDay];
      const color = dangerColor(day?.danger_class ?? "bajo");
      const [s, n, w, e] = z.bbox;
      L.rectangle([[s, w], [n, e]], { color, weight: 1, fillColor: color, fillOpacity: 0.22 }).addTo(layer);
      L.circleMarker([z.lat, z.lng], { radius: 6, color, fillColor: color, fillOpacity: 1, weight: 1 })
        .bindTooltip(`${z.name} · ${day?.danger_class ?? "—"} · FWI ${day?.fwi ?? "—"}`)
        .addTo(layer);
    }
  }, [data, selectedDay]);

  useEffect(() => {
    const layer = firesLayer.current;
    if (!layer) return;
    layer.clearLayers();
    if (!showDetection) return;
    const [s, n, w, e] = provinceBbox(data.zones);
    let alive = true;
    fetch("/api/fires")
      .then((r) => r.json())
      .then((j: { fires: { latitude: number; longitude: number; frp: number }[] }) => {
        if (!alive) return;
        for (const f of j.fires) {
          if (f.latitude < s || f.latitude > n || f.longitude < w || f.longitude > e) continue;
          L.circleMarker([f.latitude, f.longitude], {
            radius: 4, color: "#d2541d", fillColor: "#d2541d", fillOpacity: 0.8, weight: 1,
          }).bindTooltip(`Foco activo · FRP ${f.frp}`).addTo(layer);
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [showDetection, data]);

  return <div ref={elRef} style={{ width: "100%", height: "100%" }} />;
}
