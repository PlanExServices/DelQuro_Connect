import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";

const CampusContext = createContext(null);

// The local preview starts with COMMON even before an administrator saves the
// campus record. Production workspaces receive branding only from their data.
const COMMON_PREVIEW = {
  id: "preview-common",
  name: "Commonwealth Animal Hospital",
  campus_code: "COMMON",
  website_url: "https://www.commonwealthanimal.com/",
  logo_url: "/brands/commonwealth.svg",
  primary_color: "#2B2F88",
  accent_color: "#811317",
  soft_color: "#E4EEF1",
  preview_only: true,
};

const BRAND_VARIABLES = [
  "--brand", "--teal", "--teal-dark", "--burgundy", "--burgundy-dark",
  "--brand-tertiary", "--surface-tertiary", "--border-strong", "--info",
];

function validColor(value, fallback) {
  return /^#[0-9A-Fa-f]{6}$/.test(value || "") ? value : fallback;
}

function darken(hex, factor = 0.78) {
  return `#${[1, 3, 5].map((start) => Math.round(parseInt(hex.slice(start, start + 2), 16) * factor).toString(16).padStart(2, "0")).join("")}`;
}

function isLocalPreview() {
  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

export function CampusProvider({ children }) {
  const { user } = useAuth();
  const route = useLocation();
  const [locations, setLocations] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [publicCampus, setPublicCampus] = useState(null);

  const refreshLocations = useCallback(async () => {
    const { data } = await api.get("/locations");
    setLocations(data);
    setLoaded(true);
    return data;
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setLocations([]);
      setLoaded(false);
      return;
    }
    let active = true;
    api.get("/locations").then(({ data }) => {
      if (active) { setLocations(data); setLoaded(true); }
    }).catch(() => {
      if (active) { setLocations([]); setLoaded(true); }
    });
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) { setPublicCampus(null); return; }
    const code = new URLSearchParams(route.search).get("campus")?.trim().toUpperCase();
    if (!code) { setPublicCampus(isLocalPreview() ? COMMON_PREVIEW : null); return; }
    if (!/^[A-Z0-9]{2,16}$/.test(code)) { setPublicCampus(null); return; }
    setPublicCampus(null);
    let active = true;
    api.get(`/public/campuses/${code}`).then(({ data }) => {
      if (active) setPublicCampus(data);
    }).catch(() => {
      if (active) setPublicCampus(isLocalPreview() && code === "COMMON" ? COMMON_PREVIEW : null);
    });
    return () => { active = false; };
  }, [route.search, user?.id]);

  const campus = useMemo(() => {
    if (!user) return publicCampus;
    const selected = locations.find((location) => location.id === user.location_id)
      || locations.find((location) => location.campus_code === user.campus || location.name === user.campus)
      || (locations.length === 1 ? locations[0] : null);
    return selected || (loaded && locations.length === 0 && isLocalPreview() ? COMMON_PREVIEW : null);
  }, [loaded, locations, publicCampus, user]);

  useEffect(() => {
    const root = document.documentElement;
    BRAND_VARIABLES.forEach((name) => root.style.removeProperty(name));
    if (!campus) return;
    const primary = validColor(campus.primary_color, "#1B2A4A");
    const accent = validColor(campus.accent_color, "#00A5A8");
    const soft = validColor(campus.soft_color, "#E8F1F5");
    const values = {
      "--brand": primary,
      "--teal": accent,
      "--teal-dark": darken(accent),
      "--burgundy": accent,
      "--burgundy-dark": darken(accent, 0.65),
      "--brand-tertiary": soft,
      "--surface-tertiary": soft,
      "--border-strong": accent,
      "--info": primary,
    };
    Object.entries(values).forEach(([name, value]) => root.style.setProperty(name, value));
    return () => BRAND_VARIABLES.forEach((name) => root.style.removeProperty(name));
  }, [campus]);

  const value = useMemo(() => ({ campus, locations, loaded, refreshLocations }), [campus, locations, loaded, refreshLocations]);
  return <CampusContext.Provider value={value}>{children}</CampusContext.Provider>;
}

export const useCampus = () => useContext(CampusContext);
