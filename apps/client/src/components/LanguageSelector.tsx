import { useTranslation } from "react-i18next";
import { languages } from "@/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Globe } from "lucide-react";

const flagSvgs: Record<string, JSX.Element> = {
  en: (
    <svg viewBox="0 0 512 512" className="w-full h-full">
      <mask id="en_mask">
        <circle cx="256" cy="256" r="256" fill="#fff" />
      </mask>
      <g mask="url(#en_mask)">
        <path
          fill="#eee"
          d="M256 0h256v64l-32 32 32 32v64l-32 32 32 32v64l-32 32 32 32v64l-256 32L0 448v-64l32-32-32-32v-64z"
        />
        <path
          fill="#d80027"
          d="M224 64h288v64H224zm0 128h288v64H256zm-224 0h256v64H0zm0 256h256v-64H0zm0-128h512v64H0zm0-256h256v64H0z"
        />
        <path fill="#0052b4" d="M0 0h256v256H0z" />
        <path
          fill="#eee"
          d="m187 243 57-41h-70l57 41-22-67zm-81 0 57-41H93l57 41-22-67zm-81 0 57-41H12l57 41-22-67zm162-81 57-41h-70l57 41-22-67zm-81 0 57-41H93l57 41-22-67zm-81 0 57-41H12l57 41-22-67zm162-82 57-41h-70l57 41-22-67zm-81 0 57-41H93l57 41-22-67zm-81 0 57-41H12l57 41-22-67z"
        />
      </g>
    </svg>
  ),
  ar: (
    <svg viewBox="0 0 512 512" className="w-full h-full">
      <mask id="ar_mask">
        <circle cx="256" cy="256" r="256" fill="#fff" />
      </mask>
      <g mask="url(#ar_mask)">
        <path fill="#6da544" d="M0 0h512v512H0z" />
        <path
          fill="#eee"
          d="M144 224h48v16h-48zm0 48h48v16h-48zm64-48h16v64h-16zm32 0h48v16h-48zm0 48h48v16h-48zm64-48h16v64h-16zm32 0h48v16h-48zm0 48h48v16h-48zm64-48h16v64h-16z"
        />
        <path
          fill="#eee"
          d="M256 176c-44.2 0-80 35.8-80 80s35.8 80 80 80 80-35.8 80-80-35.8-80-80-80zm0 128c-26.5 0-48-21.5-48-48s21.5-48 48-48 48 21.5 48 48-21.5 48-48 48z"
        />
      </g>
    </svg>
  ),
  de: (
    <svg viewBox="0 0 512 512" className="w-full h-full">
      <mask id="de_mask">
        <circle cx="256" cy="256" r="256" fill="#fff" />
      </mask>
      <g mask="url(#de_mask)">
        <path fill="#ffda44" d="M0 341.3h512V512H0z" />
        <path fill="#d80027" d="M0 170.7h512v170.6H0z" />
        <path fill="#333" d="M0 0h512v170.7H0z" />
      </g>
    </svg>
  ),
  es: (
    <svg viewBox="0 0 512 512" className="w-full h-full">
      <mask id="es_mask">
        <circle cx="256" cy="256" r="256" fill="#fff" />
      </mask>
      <g mask="url(#es_mask)">
        <path fill="#ffda44" d="M0 128h512v256H0z" />
        <path fill="#d80027" d="M0 0h512v128H0zm0 384h512v128H0z" />
      </g>
    </svg>
  ),
  fr: (
    <svg viewBox="0 0 512 512" className="w-full h-full">
      <mask id="fr_mask">
        <circle cx="256" cy="256" r="256" fill="#fff" />
      </mask>
      <g mask="url(#fr_mask)">
        <path fill="#eee" d="M167 0h178v512H167z" />
        <path fill="#0052b4" d="M0 0h167v512H0z" />
        <path fill="#d80027" d="M345 0h167v512H345z" />
      </g>
    </svg>
  ),
  hi: (
    <svg viewBox="0 0 512 512" className="w-full h-full">
      <mask id="hi_mask">
        <circle cx="256" cy="256" r="256" fill="#fff" />
      </mask>
      <g mask="url(#hi_mask)">
        <path fill="#eee" d="M0 170.7h512v170.6H0z" />
        <path fill="#ff9811" d="M0 0h512v170.7H0z" />
        <path fill="#6da544" d="M0 341.3h512V512H0z" />
        <circle fill="#0052b4" cx="256" cy="256" r="50" />
        <circle fill="#eee" cx="256" cy="256" r="40" />
        <circle fill="#0052b4" cx="256" cy="256" r="15" />
      </g>
    </svg>
  ),
  it: (
    <svg viewBox="0 0 512 512" className="w-full h-full">
      <mask id="it_mask">
        <circle cx="256" cy="256" r="256" fill="#fff" />
      </mask>
      <g mask="url(#it_mask)">
        <path fill="#eee" d="M167 0h178v512H167z" />
        <path fill="#6da544" d="M0 0h167v512H0z" />
        <path fill="#d80027" d="M345 0h167v512H345z" />
      </g>
    </svg>
  ),
  ja: (
    <svg viewBox="0 0 512 512" className="w-full h-full">
      <mask id="ja_mask">
        <circle cx="256" cy="256" r="256" fill="#fff" />
      </mask>
      <g mask="url(#ja_mask)">
        <path fill="#eee" d="M0 0h512v512H0z" />
        <circle fill="#d80027" cx="256" cy="256" r="111.3" />
      </g>
    </svg>
  ),
  pl: (
    <svg viewBox="0 0 512 512" className="w-full h-full">
      <mask id="pl_mask">
        <circle cx="256" cy="256" r="256" fill="#fff" />
      </mask>
      <g mask="url(#pl_mask)">
        <path fill="#d80027" d="M0 256h512v256H0z" />
        <path fill="#eee" d="M0 0h512v256H0z" />
      </g>
    </svg>
  ),
  pt: (
    <svg viewBox="0 0 512 512" className="w-full h-full">
      <mask id="pt_mask">
        <circle cx="256" cy="256" r="256" fill="#fff" />
      </mask>
      <g mask="url(#pt_mask)">
        <path fill="#6da544" d="M0 0h512v512H0z" />
        <path fill="#ffda44" d="M0 0v512l256-256z" />
        <circle fill="#eee" cx="200" cy="256" r="80" />
        <circle fill="#0052b4" cx="200" cy="256" r="48" />
      </g>
    </svg>
  ),
  sv: (
    <svg viewBox="0 0 512 512" className="w-full h-full">
      <mask id="sv_mask">
        <circle cx="256" cy="256" r="256" fill="#fff" />
      </mask>
      <g mask="url(#sv_mask)">
        <path fill="#0052b4" d="M0 0h512v512H0z" />
        <path
          fill="#ffda44"
          d="M0 192h144V0h80v192h288v80H224v240h-80V272H0z"
        />
      </g>
    </svg>
  ),
};

interface LanguageSelectorProps {
  variant?: "default" | "compact" | "icon";
  className?: string;
}

export function LanguageSelector({
  variant = "default",
  className,
}: LanguageSelectorProps) {
  const { i18n, t } = useTranslation();
  const currentLang =
    languages.find((l) => l.code === i18n.language) || languages[0];

  const handleLanguageChange = (code: string) => {
    i18n.changeLanguage(code);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "icon" ? (
          <Button
            variant="ghost"
            size="icon"
            className={className}
            data-testid="button-language-selector"
          >
            <Globe className="h-4 w-4" />
          </Button>
        ) : variant === "compact" ? (
          <Button
            variant="ghost"
            size="sm"
            className={`gap-2 ${className}`}
            data-testid="button-language-selector"
          >
            <div className="w-5 h-5 rounded-full overflow-hidden border border-border shadow-sm">
              {flagSvgs[currentLang.code]}
            </div>
            <span className="uppercase text-xs font-medium">
              {currentLang.code}
            </span>
          </Button>
        ) : (
          <Button
            variant="ghost"
            className={`gap-2 ${className}`}
            data-testid="button-language-selector"
          >
            <div className="w-5 h-5 rounded-full overflow-hidden border border-border shadow-sm">
              {flagSvgs[currentLang.code]}
            </div>
            <span className="text-sm">{currentLang.nativeName}</span>
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {languages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => handleLanguageChange(lang.code)}
            className={`gap-3 cursor-pointer ${i18n.language === lang.code ? "bg-accent" : ""}`}
            data-testid={`lang-option-${lang.code}`}
          >
            <div className="w-6 h-6 rounded-full overflow-hidden border border-border shadow-sm flex-shrink-0">
              {flagSvgs[lang.code]}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium">{lang.nativeName}</span>
              <span className="text-xs text-muted-foreground">{lang.name}</span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
