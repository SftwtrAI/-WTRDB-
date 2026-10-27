import { useEffect, useMemo, useState } from "react";
import {
  Sparkles,
  MoveRight,
  BookOpen,
  Network,
  GitMerge,
  AlertTriangle,
  RadioTower,
  FlaskConical,
  BrainCircuit,
  LayoutDashboard,
  Settings,
  FileText,
  CreditCard,
  Shield,
  Map,
  Hammer,
  Telescope,
  Activity,
  Compass,
} from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { useAppView, type AppView } from "@/contexts/app-view-context";

interface PaletteItem {
  id: string;
  label: string;
  value: string;
  description: string;
  view: AppView;
  icon: React.ElementType;
}

const PALETTE_GROUPS: { group: string; items: PaletteItem[] }[] = [
  {
    group: "Locations",
    items: [
      { id: "constellation", label: "Celestial Field", description: "Star field of all knowledge graphs", view: "constellation", icon: Sparkles, value: "celestial field constellation star" },
      { id: "cartographer", label: "The Cartographer", description: "Guided onboarding and graph creation", view: "cartographer", icon: Compass, value: "cartographer onboarding guided" },
      { id: "workbench", label: "The Workbench", description: "Spatial merge playground", view: "merge-playground", icon: Hammer, value: "workbench merge playground" },
      { id: "observatory", label: "The Observatory", description: "Evaluation and quality telemetry", view: "eval-harness", icon: Telescope, value: "observatory eval harness quality" },
      { id: "pulse", label: "The Pulse Array", description: "Live graph intake events", view: "graph-pulse", icon: Activity, value: "pulse array live events" },
      { id: "brain", label: "Brain Endpoints", description: "Manage published Brain endpoints", view: "constellation", icon: BrainCircuit, value: "brain endpoints api mcp" },
    ],
  },
  {
    group: "Knowledge",
    items: [
      { id: "kb", label: "Knowledge Graphs", description: "Manage graph sources and generation", view: "constellation", icon: BookOpen, value: "knowledge graphs sources documents manage" },
      { id: "meta-graphs", label: "Meta-Knowledge Graphs", description: "Structural know-how + federations", view: "constellation", icon: Network, value: "meta knowledge graphs federations" },
    ],
  },
  {
    group: "Platform",
    items: [
      { id: "dashboard", label: "Dashboard", description: "Overview metrics", view: "dashboard", icon: LayoutDashboard, value: "dashboard overview metrics" },
      { id: "settings", label: "Settings", description: "Account and preferences", view: "settings", icon: Settings, value: "settings account preferences profile email password" },
      { id: "prompts", label: "Prompt Templates", description: "Template library", view: "prompt-templates", icon: FileText, value: "prompt templates library" },
      { id: "billing", label: "Billing", description: "Credits and subscriptions", view: "billing", icon: CreditCard, value: "billing credits subscriptions payment" },
      { id: "admin", label: "Admin Dashboard", description: "System administration", view: "admin", icon: Shield, value: "admin dashboard system" },
    ],
  },
];

export function VoidCommandPalette() {
  const [open, setOpen] = useState(false);
  const { setView } = useAppView();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (!isShortcut) return;
      event.preventDefault();
      setOpen((v) => !v);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <div className="void-command-dialog">
        <CommandInput placeholder="Navigate The Void..." />
        <CommandList>
          <CommandEmpty>No matching location.</CommandEmpty>
          {PALETTE_GROUPS.map((group) => (
            <CommandGroup key={group.group} heading={group.group}>
              {group.items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.value}
                  onSelect={() => { setOpen(false); setView(item.view); }}
                >
                  <item.icon className="h-4 w-4 text-primary" />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{item.label}</span>
                    <span className="text-xs text-muted-foreground">{item.description}</span>
                  </div>
                  <MoveRight className="ml-auto h-4 w-4 opacity-50" />
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </div>
    </CommandDialog>
  );
}
