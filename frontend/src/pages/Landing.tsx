import { Link } from "react-router-dom";
import { WifiOff, Cpu, Layers, MapPinned } from "lucide-react";
import { ArchMark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";

const FEATURES = [
  { icon: WifiOff, label: "Offline-first alerts" },
  { icon: Cpu, label: "Edge AI detection" },
  { icon: Layers, label: "Multi-hazard coverage" },
  { icon: MapPinned, label: "Real-time map" },
];

export function Landing() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex h-12 items-center justify-between border-b border-white/5 px-4">
        <Link to="/" className="flex items-center gap-3">
          <ArchMark className="size-5 shrink-0 text-arch" />
          <span className="text-lg font-semibold tracking-tight">AERIS</span>
        </Link>

        <div className="flex items-center gap-6">
          <span className="hidden text-[10px] uppercase tracking-widest text-zinc-500 sm:inline">
            Resilient Environmental Monitoring
          </span>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
        <h1 className="text-5xl font-semibold tracking-tight sm:text-7xl">AERIS</h1>

        <p className="mt-4 max-w-xl text-center text-balance text-zinc-400">
          Resilient AI-powered environmental monitoring — detecting floods, forest fires and pollution before they become disasters.
        </p>

        <p className="mt-5 max-w-xl text-center text-sm leading-relaxed text-zinc-500">
          Remote areas lack reliable connectivity, so disasters often go undetected until it is too late.
          AERIS runs on solar-powered sensor nodes with on-device AI — they detect hazards and raise
          local alerts even when the internet is down.
        </p>

        <dl className="mt-12 grid w-full max-w-2xl grid-cols-2 gap-px border border-white/5 bg-white/5 md:grid-cols-4">
          {FEATURES.map((f) => (
            <div
              key={f.label}
              className="flex flex-col items-center gap-2.5 bg-background px-4 py-6"
            >
              <f.icon className="size-5 text-arch" strokeWidth={1.5} />
              <dt className="text-center text-[10px] font-medium uppercase tracking-widest text-zinc-500">
                {f.label}
              </dt>
            </div>
          ))}
        </dl>

        <Link to="/login" className="mt-10">
          <Button size="lg">Sign In</Button>
        </Link>
      </main>

      <footer className="py-6 text-center text-[10px] uppercase tracking-widest text-zinc-600">
        AERIS — Resilient Environmental Monitoring
      </footer>
    </div>
  );
}