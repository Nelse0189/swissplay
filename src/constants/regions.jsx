import React from 'react';
import RegionGlobe from '../components/UI/RegionGlobe';

// Shared region definitions. Used across LFT, LFR, Find Scrims, and team settings.
export const REGIONS = [
  { value: 'NA', label: 'North America' },
  { value: 'EU', label: 'Europe' },
  { value: 'OCE', label: 'Oceania' },
  { value: 'Asia', label: 'Asia' },
  { value: 'SA', label: 'South America' }
];

const globeSize = 18;

// Dropdown options: globe + full name (for team creation/settings)
export const REGION_OPTIONS = REGIONS.map((r) => ({
  value: r.value,
  label: (
    <span className="region-option-label">
      <RegionGlobe region={r.value} size={globeSize} />
      <span>{r.label}</span>
    </span>
  )
}));

// Dropdown options: globe + short code (for filters, compact views)
export const REGION_OPTIONS_SHORT = REGIONS.map((r) => ({
  value: r.value,
  label: (
    <span className="region-option-label">
      <RegionGlobe region={r.value} size={globeSize} />
      <span>{r.value}</span>
    </span>
  )
}));

// For filter dropdowns that need "All" first
export const REGION_FILTER_OPTIONS = [
  { value: 'All', label: 'All Regions' },
  ...REGION_OPTIONS_SHORT
];

// Form dropdowns: "Select region" or "All regions" + options
export const REGION_FORM_OPTIONS = (placeholder = 'Select region') => [
  { value: '', label: placeholder },
  ...REGION_OPTIONS_SHORT
];

export const REGION_FILTER_BROWSE_OPTIONS = [
  { value: '', label: 'All regions' },
  ...REGION_OPTIONS_SHORT
];

// Get display element (globe + text) for badges, meta-tags, etc.
export function getRegionDisplay(regionValue) {
  if (!regionValue) return '';
  const r = REGIONS.find((x) => x.value === regionValue);
  if (!r) return regionValue;
  return (
    <span className="region-display">
      <RegionGlobe region={r.value} size={14} />
      <span>{r.value}</span>
    </span>
  );
}
