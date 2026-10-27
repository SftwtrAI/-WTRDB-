import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { useQuery } from "@tanstack/react-query";

interface BrandingData {
  app_name: string;
  app_tagline: string;
  logo_url: string | null;
  logo_url_light: string | null;
  logo_url_dark: string | null;
  favicon_url: string | null;
  social_twitter_url: string | null;
  social_linkedin_url: string | null;
  social_github_url: string | null;
}

interface CachedBranding {
  data: BrandingData;
  timestamp: number;
}

type BrandingProviderProps = {
  children: React.ReactNode;
};

type BrandingProviderState = {
  branding: BrandingData;
  currentLogo: string | null;
  showLogo: boolean;
  showFavicon: boolean;
  isLoading: boolean;
  refetch: () => void;
};

const CACHE_KEY = "wtrops-branding:v1";
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours max cache age

const defaultBranding: BrandingData = {
  app_name: "wtrdb",
  app_tagline: "Knowledge graph platform. Build, federate, and query.",
  logo_url: null,
  logo_url_light: null,
  logo_url_dark: null,
  favicon_url: null,
  social_twitter_url: null,
  social_linkedin_url: null,
  social_github_url: null,
};

function readCache(): BrandingData | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;

    const parsed: CachedBranding = JSON.parse(cached);
    const age = Date.now() - parsed.timestamp;

    if (age > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }

    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache(data: BrandingData): void {
  try {
    const cached: CachedBranding = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
  } catch {
    // localStorage might be full or disabled
  }
}

function getBrandingSignature(data: BrandingData): string {
  return [
    data.app_name,
    data.logo_url,
    data.logo_url_light,
    data.logo_url_dark,
    data.favicon_url,
  ].join("|");
}

const BrandingProviderContext = createContext<
  BrandingProviderState | undefined
>(undefined);

export function BrandingProvider({ children }: BrandingProviderProps) {
  const cachedData = useMemo(() => readCache(), []);
  const initialData = cachedData || defaultBranding;

  const [branding, setBranding] = useState<BrandingData>(initialData);
  const [hasLoaded, setHasLoaded] = useState(!!cachedData);

  const { data, isLoading, refetch } = useQuery<BrandingData>({
    queryKey: ["/api/branding"],
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    initialData: cachedData || undefined,
    initialDataUpdatedAt: cachedData ? 0 : undefined,
  });

  useEffect(() => {
    if (data) {
      const newBranding: BrandingData = {
        app_name: data.app_name || defaultBranding.app_name,
        app_tagline: data.app_tagline || defaultBranding.app_tagline,
        logo_url: data.logo_url,
        logo_url_light: data.logo_url_light,
        logo_url_dark: data.logo_url_dark,
        favicon_url: data.favicon_url,
        social_twitter_url: data.social_twitter_url,
        social_linkedin_url: data.social_linkedin_url,
        social_github_url: data.social_github_url,
      };

      const oldSig = getBrandingSignature(branding);
      const newSig = getBrandingSignature(newBranding);

      if (oldSig !== newSig || !hasLoaded) {
        setBranding(newBranding);
        writeCache(newBranding);
      }

      setHasLoaded(true);
    }
  }, [data]);

  useEffect(() => {
    if (branding.favicon_url) {
      const existingFavicon = document.querySelector("link[rel='icon']");
      if (existingFavicon) {
        existingFavicon.setAttribute("href", branding.favicon_url);
      } else {
        const favicon = document.createElement("link");
        favicon.rel = "icon";
        favicon.href = branding.favicon_url;
        document.head.appendChild(favicon);
      }
    }
  }, [branding.favicon_url]);

  const handleRefetch = useCallback(() => {
    refetch();
  }, [refetch]);

  const currentLogo =
    branding.logo_url_dark || branding.logo_url_light || branding.logo_url;

  const showLogo = !!currentLogo;
  const showFavicon = !!branding.favicon_url;

  return (
    <BrandingProviderContext.Provider
      value={{
        branding,
        currentLogo,
        showLogo,
        showFavicon,
        isLoading: isLoading && !hasLoaded,
        refetch: handleRefetch,
      }}
    >
      {children}
    </BrandingProviderContext.Provider>
  );
}

export function useBranding() {
  const context = useContext(BrandingProviderContext);
  if (context === undefined) {
    throw new Error("useBranding must be used within a BrandingProvider");
  }
  return context;
}
