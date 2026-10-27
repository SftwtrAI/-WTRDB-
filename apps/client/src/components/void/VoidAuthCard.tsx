import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { AuthStorage } from "@/lib/auth-storage";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

const signupInfoSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const otpSchema = z.object({
  otpCode: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

type LoginFormData = z.infer<typeof loginSchema>;
type SignupInfoFormData = z.infer<typeof signupInfoSchema>;
type OtpFormData = z.infer<typeof otpSchema>;

type Mode = "signin" | "signup-info" | "signup-otp";

interface VoidAuthCardProps {
  contextMessage?: string | null;
}

export function VoidAuthCard({ contextMessage }: VoidAuthCardProps) {
  const [mode, setMode] = useState<Mode>("signin");
  const [showPassword, setShowPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingSignup, setPendingSignup] = useState<SignupInfoFormData | null>(
    null,
  );
  const { toast } = useToast();

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const signupInfoForm = useForm<SignupInfoFormData>({
    resolver: zodResolver(signupInfoSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  const otpForm = useForm<OtpFormData>({
    resolver: zodResolver(otpSchema),
    defaultValues: { otpCode: "" },
  });

  const handleLogin = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Login failed");

      AuthStorage.setAuthData(
        result.token,
        result.user,
        result.refreshToken,
        result.expiresIn,
      );
      toast({ title: "Welcome back!" });
      window.location.reload();
    } catch (err: any) {
      toast({
        title: "Login failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestOtp = async (data: SignupInfoFormData) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email, name: data.name }),
      });
      const result = await res.json();
      if (!res.ok)
        throw new Error(result.error || "Failed to send verification code");

      setPendingSignup(data);
      otpForm.reset({ otpCode: "" });
      setMode("signup-otp");
      toast({
        title: "Verification code sent",
        description: `Check ${data.email} for the 6-digit code.`,
      });
    } catch (err: any) {
      toast({
        title: "Couldn't send code",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyAndRegister = async (data: OtpFormData) => {
    if (!pendingSignup) {
      setMode("signup-info");
      return;
    }
    setIsLoading(true);
    try {
      const verifyRes = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: pendingSignup.email,
          otpCode: data.otpCode,
        }),
      });
      const verifyResult = await verifyRes.json();
      if (!verifyRes.ok)
        throw new Error(verifyResult.error || "Verification failed");

      const registerRes = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pendingSignup),
        credentials: "include",
      });
      const registerResult = await registerRes.json();
      if (!registerRes.ok)
        throw new Error(registerResult.error || "Registration failed");

      AuthStorage.setAuthData(
        registerResult.token,
        registerResult.user,
        registerResult.refreshToken,
        registerResult.expiresIn,
      );
      localStorage.setItem("wtrdb_new_user", "true");
      toast({ title: "Welcome to wtrdb!" });
      window.location.reload();
    } catch (err: any) {
      toast({
        title: "Sign-up failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!pendingSignup) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: pendingSignup.email,
          name: pendingSignup.name,
        }),
      });
      const result = await res.json();
      if (!res.ok)
        throw new Error(result.error || "Failed to resend verification code");
      toast({ title: "New code sent" });
    } catch (err: any) {
      toast({
        title: "Couldn't resend code",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const switchToSignin = () => {
    setMode("signin");
    setPendingSignup(null);
  };

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center pointer-events-none">
      <div className="pointer-events-auto w-[380px] max-w-[calc(100vw-32px)] rounded-xl border border-[#243645] bg-[#111A21]/92 p-6 backdrop-blur-xl shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-foreground">
            wtrdb
          </h2>
          {mode === "signup-otp" && (
            <button
              type="button"
              onClick={() => setMode("signup-info")}
              className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Back
            </button>
          )}
        </div>

        {contextMessage && (
          <div className="mb-4 rounded-lg border border-[#07A288]/30 bg-[#07A288]/8 px-3 py-2 text-xs text-[#07A288]">
            {contextMessage}
          </div>
        )}

        {mode === "signin" && (
          <form
            onSubmit={loginForm.handleSubmit(handleLogin)}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Email</Label>
              <Input
                {...loginForm.register("email")}
                type="email"
                placeholder="you@company.com"
                className="h-9 border-[#243645] bg-[#0B1014]/80 text-sm"
              />
              {loginForm.formState.errors.email && (
                <p className="text-[10px] text-destructive">
                  {loginForm.formState.errors.email.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Password</Label>
              <div className="relative">
                <Input
                  {...loginForm.register("password")}
                  type={showPassword ? "text" : "password"}
                  className="h-9 border-[#243645] bg-[#0B1014]/80 text-sm pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-9 text-sm"
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Sign In
            </Button>
            <div className="pt-1 text-center text-[11px] text-muted-foreground">
              No account?{" "}
              <button
                type="button"
                onClick={() => setMode("signup-info")}
                className="text-[#07A288] hover:underline"
              >
                Sign up
              </button>
            </div>
          </form>
        )}

        {mode === "signup-info" && (
          <form
            onSubmit={signupInfoForm.handleSubmit(handleRequestOtp)}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Name</Label>
              <Input
                {...signupInfoForm.register("name")}
                placeholder="Your name"
                className="h-9 border-[#243645] bg-[#0B1014]/80 text-sm"
              />
              {signupInfoForm.formState.errors.name && (
                <p className="text-[10px] text-destructive">
                  {signupInfoForm.formState.errors.name.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Email</Label>
              <Input
                {...signupInfoForm.register("email")}
                type="email"
                placeholder="you@company.com"
                className="h-9 border-[#243645] bg-[#0B1014]/80 text-sm"
              />
              {signupInfoForm.formState.errors.email && (
                <p className="text-[10px] text-destructive">
                  {signupInfoForm.formState.errors.email.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Password</Label>
              <div className="relative">
                <Input
                  {...signupInfoForm.register("password")}
                  type={showSignupPassword ? "text" : "password"}
                  placeholder="At least 8 characters"
                  className="h-9 border-[#243645] bg-[#0B1014]/80 text-sm pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowSignupPassword(!showSignupPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showSignupPassword ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
              {signupInfoForm.formState.errors.password && (
                <p className="text-[10px] text-destructive">
                  {signupInfoForm.formState.errors.password.message}
                </p>
              )}
            </div>
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-9 text-sm"
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Send Verification Code
            </Button>
            <div className="pt-1 text-center text-[11px] text-muted-foreground">
              Already have an account?{" "}
              <button
                type="button"
                onClick={switchToSignin}
                className="text-[#07A288] hover:underline"
              >
                Sign in
              </button>
            </div>
          </form>
        )}

        {mode === "signup-otp" && (
          <form
            onSubmit={otpForm.handleSubmit(handleVerifyAndRegister)}
            className="space-y-4"
          >
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              We sent a 6-digit code to{" "}
              <span className="text-foreground">{pendingSignup?.email}</span>.
              Enter it below to complete sign-up.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Verification Code
              </Label>
              <Input
                {...otpForm.register("otpCode")}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                className="h-9 border-[#243645] bg-[#0B1014]/80 text-sm tracking-[0.4em] text-center"
              />
              {otpForm.formState.errors.otpCode && (
                <p className="text-[10px] text-destructive">
                  {otpForm.formState.errors.otpCode.message}
                </p>
              )}
            </div>
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-9 text-sm"
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Verify & Create Account
            </Button>
            <div className="flex items-center justify-between pt-1 text-[11px] text-muted-foreground">
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={isLoading}
                className="text-[#07A288] hover:underline disabled:opacity-50"
              >
                Resend code
              </button>
              <button
                type="button"
                onClick={switchToSignin}
                className="text-[#07A288] hover:underline"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
