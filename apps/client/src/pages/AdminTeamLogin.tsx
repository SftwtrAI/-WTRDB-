import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useBranding } from "@/components/BrandingProvider";
import { Eye, EyeOff, Shield, ArrowLeft, Loader2 } from "lucide-react";
import { Link } from "wouter";
import TeamAuth from "@/lib/team-auth";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function AdminTeamLogin() {
  const [, setLocation] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { branding, currentLogo } = useBranding();

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const handleLogin = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/team/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Login failed");
      }

      if (result.token) {
        TeamAuth.setToken(result.token);
        TeamAuth.setMember(result.member);
        TeamAuth.setTeam(result.team);
      }

      toast({
        title: "Welcome!",
        description: `Logged in as ${result.member?.firstName || result.member?.email}`,
      });

      setLocation("/admin");
    } catch (error: any) {
      toast({
        title: "Login failed",
        description: error.message || "Invalid credentials",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-orange-500/10 via-orange-500/5 to-background items-center justify-center p-12">
        <div className="max-w-md text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="w-20 h-20 mx-auto mb-8 rounded-2xl bg-orange-500/10 flex items-center justify-center">
              <Shield className="w-10 h-10 text-orange-500" />
            </div>
            <h1 className="text-3xl font-bold mb-4">Admin Portal</h1>
            <p className="text-muted-foreground text-lg">
              Administrative access for platform management and oversight.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="mt-12 grid grid-cols-2 gap-4"
          >
            <div className="p-4 rounded-lg bg-card border">
              <div className="text-2xl font-bold text-orange-500">Admin</div>
              <div className="text-sm text-muted-foreground">Access</div>
            </div>
            <div className="p-4 rounded-lg bg-card border">
              <div className="text-2xl font-bold text-orange-500">Role</div>
              <div className="text-sm text-muted-foreground">Based</div>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <div className="mb-8">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to home
            </Link>
          </div>

          <div className="flex justify-center mb-8">
            {currentLogo ? (
              <img
                src={currentLogo}
                alt={branding.app_name}
                className="h-10 w-auto object-contain"
              />
            ) : (
              <div className="flex items-center gap-2">
                <Shield className="h-8 w-8 text-orange-500" />
                <span className="text-xl font-bold">{branding.app_name}</span>
              </div>
            )}
          </div>

          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Admin Team Login</CardTitle>
              <CardDescription>
                Sign in with your admin team credentials
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(handleLogin)}
                  className="space-y-4"
                >
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="admin@company.com"
                            {...field}
                            disabled={isLoading}
                            data-testid="input-admin-team-email"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showPassword ? "text" : "password"}
                              placeholder="Enter your password"
                              {...field}
                              disabled={isLoading}
                              data-testid="input-admin-team-password"
                            />
                            <button
                              type="button"
                              className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground transition-colors"
                              onClick={() => setShowPassword(!showPassword)}
                              tabIndex={-1}
                              data-testid="button-toggle-admin-password"
                            >
                              {showPassword ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading}
                    data-testid="button-admin-team-login"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      "Sign In"
                    )}
                  </Button>
                </form>
              </Form>

              <div className="mt-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Not an admin?{" "}
                  <Link href="/login" className="text-primary hover:underline">
                    Login as user
                  </Link>
                  {" or "}
                  <Link
                    href="/team/login"
                    className="text-primary hover:underline"
                  >
                    team member
                  </Link>
                </p>
              </div>
            </CardContent>
          </Card>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            Contact the system administrator if you need access or forgot your
            password.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
