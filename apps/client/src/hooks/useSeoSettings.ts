"use strict";
import { useQuery } from "@tanstack/react-query";

interface OrganizationSchema {
  name?: string;
  url?: string;
  logo?: string;
  description?: string;
  contactPoint?: {
    telephone?: string;
    contactType?: string;
    email?: string;
  };
  sameAs?: string[];
}

interface FaqItem {
  question: string;
  answer: string;
}

interface ProductSchema {
  name?: string;
  description?: string;
  image?: string;
  brand?: string;
  sku?: string;
  price?: string;
  priceCurrency?: string;
  availability?: "InStock" | "OutOfStock" | "PreOrder" | "Discontinued";
  url?: string;
  ratingValue?: string;
  ratingCount?: string;
}

export interface PublicSeoSettings {
  defaultTitle: string | null;
  defaultDescription: string | null;
  defaultKeywords: string[];
  defaultOgImage: string | null;
  canonicalBaseUrl: string | null;
  twitterHandle: string | null;
  facebookAppId: string | null;
  googleVerification: string | null;
  bingVerification: string | null;
  structuredDataOrg: OrganizationSchema | null;
  structuredDataFaq: FaqItem[] | null;
  structuredDataProduct: ProductSchema | null;
}

export function useSeoSettings() {
  return useQuery<PublicSeoSettings>({
    queryKey: ["/api/public/seo"],
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnWindowFocus: false,
  });
}
