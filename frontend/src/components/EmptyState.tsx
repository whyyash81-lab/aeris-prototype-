import { Button } from "@/components/ui/button";

export function EmptyState({ configured, error }: { configured: boolean; error: string | null }) {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <div className="mb-4 text-sm font-medium tracking-widest uppercase text-zinc-500">
          {!configured ? "NOT CONFIGURED" : error ? "CONNECTION FAILED" : "NO DATA"}
        </div>
        <p className="text-sm text-zinc-500 leading-relaxed mb-4">
          {!configured
            ? `Create <code class="bg-white/5 px-1 font-mono text-[10px]">frontend/.env</code> from <code class="bg-white/5 px-1 font-mono text-[10px]">frontend/.env.example</code> with Firebase config, then restart <code class="bg-white/5 px-1 font-mono text-[10px]">npm run dev</code>.`
            : error
            ? `Check Firestore is enabled for <code class="bg-white/5 px-1 font-mono text-[10px]">{import.meta.env.VITE_FIREBASE_PROJECT_ID}</code> and you are online.`
            : "No readings yet. Start the simulator."}
        </p>
        {error && (
          <pre className="mb-4 text-[10px] font-mono text-critical bg-white/2 p-3 text-left overflow-auto">{error}</pre>
        )}
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>Reload</Button>
      </div>
    </div>
  );
}