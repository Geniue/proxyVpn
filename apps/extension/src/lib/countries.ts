import type { CountryOption } from "../types/vpn";

export const COUNTRIES: CountryOption[] = [
  { code: "US", label: "United States", flag: "US", region: "Virginia relay cluster" },
  { code: "AE", label: "United Arab Emirates", flag: "AE", region: "Dubai relay cluster" },
  { code: "DE", label: "Germany", flag: "DE", region: "Frankfurt relay cluster" },
  { code: "EG", label: "Egypt", flag: "EG", region: "Cairo relay cluster" },
  { code: "SG", label: "Singapore", flag: "SG", region: "Singapore relay cluster" },
  { code: "TR", label: "Turkey", flag: "TR", region: "Istanbul relay cluster" },
  { code: "JP", label: "Japan", flag: "JP", region: "Tokyo relay cluster" },
  { code: "BR", label: "Brazil", flag: "BR", region: "Sao Paulo relay cluster" },
  { code: "IN", label: "India", flag: "IN", region: "Mumbai relay cluster" },
];

export function getCountryByCode(code: string | undefined): CountryOption | null {
  if (!code) {
    return null;
  }

  return COUNTRIES.find((country) => country.code === code) ?? null;
}
