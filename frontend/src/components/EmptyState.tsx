import { Button } from "@/components/ui/button";

export function EmptyState({ configured, error }: { configured: boolean; error: string | null }) {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "?";
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <div className="mb-4 text-sm font-medium tracking-widest uppercase text-zinc-500">
          {!configured ? "NOT CONFIGURED" : error ? "CONNECTION FAILED" : "NO DATA"}
        </div>
        <p className="text-sm text-zinc-500 leading-relaxed mb-4">
          {!configured
            ? "Create frontend/.env from frontend/.env.example with Firebase config, add the same VITE_* values to Vercel, and redeploy."
            : error
            ? `${projectId} — Firestore listener error, see the red text below. Security rules make reads public, so this is a connectivity or config problem, not a permissions one.`
            : `${projectId} — connected, but no readings or alerts yet. The demo data currently lives in the LOCAL emulator, not here. Feed this project (simulator pointed at production + Cloud Functions deployed) to see data.`}
        </p>
        {error && (
          <pre className="mb-4 text-[10px] font-mono text-critical bg-white/2 p-3 text-left overflow-auto whitespace-pre-wrap">{error}</pre>
        )}
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>Reload</Button>
      </div>
    </div>
  );
}