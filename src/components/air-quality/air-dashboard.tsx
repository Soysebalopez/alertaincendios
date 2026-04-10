"use client";

import { useState } from "react";
import { ProvinceSelector } from "./province-selector";
import { CityCard } from "./city-card";
import type { Province } from "@/lib/argentina-cities";

export function AirDashboard() {
  const [province, setProvince] = useState<Province | null>(null);

  return (
    <div>
      {/* Province selector */}
      <div className="mb-8">
        <p className="font-mono text-xs text-muted mb-3">
          Selecciona una provincia:
        </p>
        <ProvinceSelector
          selected={province?.id ?? null}
          onSelect={setProvince}
        />
      </div>

      {/* City cards */}
      {province ? (
        <div>
          <p className="text-sm text-muted mb-4">
            Mostrando calidad del aire para{" "}
            <span className="text-foreground/90 font-medium">
              {province.name}
            </span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {province.cities.map((city) => {
              const citySlug = city.name
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/(^-|-$)/g, "");
              return (
                <CityCard
                  key={`${province.id}-${city.name}`}
                  name={city.name}
                  lat={city.lat}
                  lng={city.lng}
                  href={`/ciudad/${province.id}/${citySlug}`}
                />
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface-2 p-12 text-center">
          <p className="text-sm text-muted">
            Selecciona una provincia para ver la calidad del aire en sus
            principales ciudades.
          </p>
        </div>
      )}
    </div>
  );
}
