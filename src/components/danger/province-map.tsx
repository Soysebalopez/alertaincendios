"use client";
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { dangerColor, provinceBbox, type ProvinceDanger } from "@/lib/fire-danger";

export function ProvinceMap({ data, selectedDay }: { data: ProvinceDanger; selectedDay: number }) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const zonesLayer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!elRef.current) return;
    const [s, n, w, e] = provinceBbox(data.zones);
    const map = L.map(elRef.current, { zoomControl: false, attributionControl: false });
    map.fitBounds([[s, w], [n, e]], { padding: [24, 24] });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", { maxZoom: 18 }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    zonesLayer.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      zonesLayer.current = null;
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

  return <div ref={elRef} style={{ width: "100%", height: "100%" }} />;
}
