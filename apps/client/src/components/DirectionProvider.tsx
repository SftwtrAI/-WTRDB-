import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";

type Direction = "ltr" | "rtl";

interface DirectionContextType {
  direction: Direction;
  isRTL: boolean;
}

const DirectionContext = createContext<DirectionContextType>({
  direction: "ltr",
  isRTL: false,
});

const RTL_LANGUAGES = ["ar", "he", "fa", "ur"];

function getInitialDirection(): Direction {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return "ltr";
  }

  try {
    const storedDirection = localStorage.getItem(
      "direction",
    ) as Direction | null;
    if (storedDirection === "rtl" || storedDirection === "ltr") {
      return storedDirection;
    }

    const storedLang =
      localStorage.getItem("i18nextLng")?.split("-")[0] || "en";
    return RTL_LANGUAGES.includes(storedLang) ? "rtl" : "ltr";
  } catch {
    return "ltr";
  }
}

function applyDirection(newDirection: Direction, lang: string) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dir = newDirection;
  document.documentElement.lang = lang;

  if (newDirection === "rtl") {
    document.documentElement.classList.add("rtl");
    document.documentElement.classList.remove("ltr");
  } else {
    document.documentElement.classList.add("ltr");
    document.documentElement.classList.remove("rtl");
  }

  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem("direction", newDirection);
    } catch {
      // Ignore storage errors in restricted environments
    }
  }
}

const initialDirection = getInitialDirection();
if (typeof document !== "undefined" && typeof localStorage !== "undefined") {
  try {
    const storedLang =
      localStorage.getItem("i18nextLng")?.split("-")[0] || "en";
    applyDirection(initialDirection, storedLang);
  } catch {
    // Ignore errors in restricted environments
  }
}

export function DirectionProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const [direction, setDirection] = useState<Direction>(initialDirection);

  useEffect(() => {
    const currentLang = i18n.language?.split("-")[0] || "en";
    const isRTL = RTL_LANGUAGES.includes(currentLang);
    const newDirection = isRTL ? "rtl" : "ltr";

    setDirection(newDirection);
    applyDirection(newDirection, currentLang);
  }, [i18n.language]);

  useEffect(() => {
    const handleLanguageChange = (lng: string) => {
      const lang = lng.split("-")[0];
      const isRTL = RTL_LANGUAGES.includes(lang);
      const newDirection = isRTL ? "rtl" : "ltr";

      setDirection(newDirection);
      applyDirection(newDirection, lang);
    };

    i18n.on("languageChanged", handleLanguageChange);
    return () => {
      i18n.off("languageChanged", handleLanguageChange);
    };
  }, [i18n]);

  return (
    <DirectionContext.Provider
      value={{ direction, isRTL: direction === "rtl" }}
    >
      {children}
    </DirectionContext.Provider>
  );
}

export function useDirection() {
  const context = useContext(DirectionContext);
  if (!context) {
    throw new Error("useDirection must be used within a DirectionProvider");
  }
  return context;
}

export { RTL_LANGUAGES };
