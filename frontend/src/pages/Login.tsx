import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArchMark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export function Login() {
  const { user, signIn } = useAuth();
  const [submitted, setSubmitted] = useState(false);

  // Already signed in (or the form just submitted) - move to the dashboard
  // with client-side navigation, no page reload.
  if (user || submitted) return <Navigate to="/dashboard" replace />;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    if (!email) return;
    signIn(email);
    setSubmitted(true);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex h-12 items-center justify-between border-b border-white/5 px-4">
        <Link to="/" className="flex items-center gap-3">
          <ArchMark className="size-5 shrink-0 text-arch" />
          <span className="text-lg font-semibold tracking-tight">AERIS</span>
        </Link>

        <div className="flex items-center gap-6">
          <Link
            to="/"
            className="hidden text-[10px] uppercase tracking-widest text-zinc-500 transition-colors hover:text-white sm:inline"
          >
            Back to home
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm">
          <ArchMark className="size-8 shrink-0 text-arch" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-zinc-500">
            AERIS is invite-only. Accounts are provisioned by the team.
          </p>

          <form className="mt-8 space-y-4" onSubmit={onSubmit}>
            <label className="block">
              <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
                Email
              </span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                placeholder="you@example.org"
                className="mt-1 w-full border border-border-strong bg-black px-3 py-2 font-mono text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-arch"
              />
            </label>

            <label className="block">
              <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
                Password
              </span>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className="mt-1 w-full border border-border-strong bg-black px-3 py-2 font-mono text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-arch"
              />
            </label>

            <Button type="submit" size="lg" className="w-full">
              Sign In
            </Button>
          </form>

          <p className="mt-6 text-center text-[10px] uppercase tracking-widest text-zinc-600">
            No self-registration — contact the AERIS team
          </p>
        </div>
      </main>
    </div>
  );
}