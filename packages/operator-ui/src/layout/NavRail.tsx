import type { ViewKey } from "../store/useStore";

interface NavItem {
  key: ViewKey;
  label: string;
  icon: string;
}

const items: NavItem[] = [
  { key: "makeability", label: "Make", icon: "▣" },
  { key: "catalog", label: "Catalog", icon: "▤" },
  { key: "bottles", label: "Bottles", icon: "▥" },
  { key: "recipes", label: "Recipes", icon: "▦" },
  { key: "shopping", label: "Shop", icon: "▨" },
  { key: "nodes", label: "Nodes", icon: "▩" },
];

interface Props {
  view: ViewKey;
  onNav(view: ViewKey): void;
}

export function NavRail({ view, onNav }: Props) {
  return (
    <nav
      aria-label="primary"
      className="flex flex-col items-stretch gap-0.5 w-20 shrink-0 border-r border-bg-3 bg-bg-2/40 py-1"
    >
      {items.map((it) => {
        const active = view === it.key;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onNav(it.key)}
            aria-current={active ? "page" : undefined}
            className={`mx-1 flex flex-col items-center gap-0.5 rounded px-1 py-2 text-2xs ${
              active
                ? "bg-bg-3 text-accent"
                : "text-fg-2 hover:bg-bg-3 hover:text-fg"
            }`}
          >
            <span className="text-base leading-none" aria-hidden>
              {it.icon}
            </span>
            <span className="font-mono uppercase tracking-wide">{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
