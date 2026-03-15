import { ChevronDown } from "lucide-react";
import { COUNTRIES, getCountryByCode } from "../lib/countries";
import type { CountryOption } from "../types/vpn";

type CountrySelectorProps = {
  value: CountryOption | null;
  onChange: (country: CountryOption | null) => void;
  label?: string;
  helperText?: string;
  placeholder?: string;
};

export function CountrySelector({
  value,
  onChange,
  label = "Relay Region",
  helperText = "Select a peer pool",
  placeholder = "Choose a country",
}: CountrySelectorProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
        <span>{label}</span>
        <span>{value ? value.region : helperText}</span>
      </div>
      <div className="relative">
        <select
          className="h-14 w-full appearance-none rounded-[1.1rem] border border-white/80 bg-white/70 px-4 pr-12 text-sm font-medium text-slate-800 shadow-sm backdrop-blur outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500"
          aria-label="Select a relay region"
          value={value?.code ?? ""}
          onChange={(event) => onChange(getCountryByCode(event.target.value))}
        >
          <option value="">{placeholder}</option>
          {COUNTRIES.map((country) => (
            <option key={country.code} value={country.code}>
              {country.flag} {country.label} - {country.region}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      </div>
    </div>
  );
}
