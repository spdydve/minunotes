import { createRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "../lib/auth-client";
import { Button } from "../components/ui/button";
import { rootRoute } from "./__root";

function AuthView() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authClient.signIn.emailOtp({ email, otp });
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setLoading(false);
    }
  };

  return <div className="grid min-h-screen place-items-center bg-slate-50 p-6 text-slate-950 dark:bg-slate-950 dark:text-slate-100">
    <div className="w-full max-w-md rounded-lg border bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <h1 className="text-xl font-semibold">{step === "email" ? "Sign in" : "Check your email"}</h1>
      <p className="mt-2 text-sm text-slate-500">{step === "email" ? "Enter your email to receive a one-time code." : `Enter the code sent to ${email}.`}</p>
      {error && <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
      {step === "email" ? <form className="mt-5 space-y-4" onSubmit={sendOtp}>
        <input autoFocus required type="email" className="w-full rounded-md border bg-transparent px-3 py-2" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button className="w-full" type="submit" disabled={loading}>{loading ? "Sending..." : "Send code"}</Button>
      </form> : <form className="mt-5 space-y-4" onSubmit={verifyOtp}>
        <input autoFocus required className="w-full rounded-md border bg-transparent px-3 py-2" placeholder="123456" value={otp} onChange={(e) => setOtp(e.target.value)} />
        <div className="flex gap-2"><Button type="button" onClick={() => setStep("email")} disabled={loading}>Back</Button><Button className="flex-1" type="submit" disabled={loading}>{loading ? "Verifying..." : "Verify"}</Button></div>
      </form>}
    </div>
  </div>;
}

export const authRoute = createRoute({ getParentRoute: () => rootRoute, path: "/auth", component: AuthView });
