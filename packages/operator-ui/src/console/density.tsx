/**
 * Density context — set once at the App root from the operator's Tweaks
 * preference, consumed by Cell and Stat so layout breathes with the choice.
 *
 * Kept in /console so the primitives don't reach back into /store and Cell
 * stays storage-agnostic. App.tsx is the bridge.
 */
import { createContext, useContext, type ReactNode } from "react";
import { DENSITY_SCALE, type Density } from "./tokens";

const DensityContext = createContext<Density>("regular");

export function DensityProvider({ value, children }: { value: Density; children: ReactNode }) {
  return <DensityContext.Provider value={value}>{children}</DensityContext.Provider>;
}

export function useDensity(): Density {
  return useContext(DensityContext);
}

export function useDensityScale() {
  return DENSITY_SCALE[useDensity()];
}
