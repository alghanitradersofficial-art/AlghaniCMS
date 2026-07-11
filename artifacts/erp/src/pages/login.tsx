import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { apiLogin, setAuth } from "@/lib/auth";
import { AlertCircle, Eye, EyeOff } from "lucide-react";

const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export default function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { token, user } = await apiLogin(email, password);
      setAuth(token, user);
      setLocation("/dashboard");
    } catch (err: unknown) {
      setError((err as Error).message || "Login failed. Check credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    try {
      const res = await fetch(`${BASE}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      });
      if (res.ok) {
        setForgotSent(true);
      } else {
        const err = await res.json();
        setError(err.error || "Request failed");
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-background dark relative overflow-hidden">
      <div className="absolute inset-0 z-0 opacity-20 bg-cover bg-center" style={{ backgroundImage: "url('/banner.png')" }} />
      <div className="absolute inset-0 z-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 w-full flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-card/80 backdrop-blur-xl border-primary/20 shadow-2xl shadow-primary/5">
          <CardHeader className="space-y-4 pb-8 text-center flex flex-col items-center">
            <img src="/logo.jpg" alt="Al Ghani Traders" className="w-20 h-20 rounded-lg shadow-lg border border-primary/20" />
            <div>
              <CardTitle className="text-3xl font-bold tracking-tight uppercase">Al Ghani Traders</CardTitle>
              <CardDescription className="text-primary/80 uppercase tracking-widest text-xs mt-2 font-medium">Enterprise Management System</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {!forgotMode ? (
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="uppercase text-xs tracking-wider text-muted-foreground">Email</Label>
                  <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="junaid@alghani.pk" className="bg-background/50 border-muted-foreground/20 focus:border-primary transition-colors h-12" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="uppercase text-xs tracking-wider text-muted-foreground">Password</Label>
                  <div className="relative">
                    <Input id="password" type={showPass ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                      className="bg-background/50 border-muted-foreground/20 focus:border-primary transition-colors h-12 pr-12" required />
                    <button type="button" onClick={() => setShowPass(!showPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors">
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {error && (
                  <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />{error}
                  </div>
                )}
                <Button type="submit" disabled={loading} className="w-full h-12 text-base font-bold tracking-widest uppercase bg-primary hover:bg-primary/90 shadow-[0_0_15px_rgba(220,38,38,0.3)] hover:shadow-[0_0_25px_rgba(220,38,38,0.5)] transition-all">
                  {loading ? "Authenticating..." : "System Access"}
                </Button>
                <div className="text-center">
                  <button type="button" onClick={() => { setForgotMode(true); setError(""); }}
                    className="text-xs text-muted-foreground hover:text-primary transition-colors">
                    Forgot password? Request reset
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-5">
                {forgotSent ? (
                  <div className="text-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                      <span className="text-3xl">✅</span>
                    </div>
                    <div>
                      <p className="font-medium text-white">Request Sent!</p>
                      <p className="text-sm text-muted-foreground mt-1">Your request has been sent to the administrator. They will reset your password shortly.</p>
                    </div>
                    <Button onClick={() => { setForgotMode(false); setForgotSent(false); setError(""); }} className="w-full bg-primary hover:bg-primary/90">
                      Back to Login
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div className="text-center mb-2">
                      <p className="font-medium text-white text-sm">Password Reset Request</p>
                      <p className="text-xs text-muted-foreground mt-1">Enter your email — administrator will be notified to reset it.</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="uppercase text-xs tracking-wider text-muted-foreground">Your Email</Label>
                      <Input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                        placeholder="yourname@alghani.pk" className="bg-background/50 border-muted-foreground/20 h-12" required />
                    </div>
                    {error && <p className="text-xs text-destructive">{error}</p>}
                    <Button type="submit" disabled={forgotLoading} className="w-full h-12 bg-primary hover:bg-primary/90 font-bold">
                      {forgotLoading ? "Sending..." : "Send Reset Request"}
                    </Button>
                    <button type="button" onClick={() => { setForgotMode(false); setError(""); }} className="w-full text-xs text-muted-foreground hover:text-white">
                      ← Back to Login
                    </button>
                  </form>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
