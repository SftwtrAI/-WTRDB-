import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CreditCard,
  Download,
  Plus,
  Loader2,
  Check,
  Crown,
  CalendarCheck,
  AlertCircle,
  CircleDollarSign,
  Coins,
  Receipt,
  TrendingUp,
  Sparkles,
  ArrowUpRight,
  Clock,
  Globe,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useTranslation } from "react-i18next";

type GatewayType =
  | "stripe"
  | "razorpay"
  | "paypal"
  | "paystack"
  | "mercadopago";

interface CurrencyOption {
  code: string;
  symbol: string;
  name: string;
  gateways: GatewayType[];
}

interface PaymentGatewayConfig {
  stripeEnabled: boolean;
  razorpayEnabled: boolean;
  paypalEnabled: boolean;
  paystackEnabled: boolean;
  mercadopagoEnabled: boolean;
  stripePublicKey?: string;
  stripeCurrency?: string;
  stripeCurrencySymbol?: string;
  stripeCurrencyLocked?: boolean;
  razorpayKeyId?: string;
  razorpayCurrency?: string;
  razorpayCurrencySymbol?: string;
  paypalClientId?: string;
  paypalCurrency?: string;
  paypalCurrencySymbol?: string;
  paypalMode?: string;
  paystackPublicKey?: string;
  paystackCurrency?: string;
  paystackCurrencySymbol?: string;
  paystackCurrencies?: string[];
  paystackDefaultCurrency?: string;
  mercadopagoPublicKey?: string;
  mercadopagoCurrency?: string;
  mercadopagoCurrencySymbol?: string;
  mercadopagoCurrencies?: string[];
}

interface User {
  credits: number;
  rolloverCredits?: number;
  planId: string | null;
  email?: string;
}

interface Plan {
  id: string;
  name: string;
  displayName: string;
  description: string;
  monthlyPrice: string;
  yearlyPrice: string | null;
  razorpayMonthlyPrice: string | null;
  razorpayYearlyPrice: string | null;
  maxAgents: number;
  maxCampaigns: number;
  maxContactsPerCampaign: number;
  includedCredits: number;
  signupBonusCredits?: number;
  creditRolloverMonths?: number;
  creditRolloverCap?: number;
  supportTier?: string;
}

interface UserSubscription {
  id: string;
  planId: string;
  stripeSubscriptionId: string | null;
  razorpaySubscriptionId: string | null;
  paypalSubscriptionId: string | null;
  paystackSubscriptionCode: string | null;
  paystackEmailToken: string | null;
  mercadopagoSubscriptionId: string | null;
  status: string;
  billingPeriod: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  plan: Plan;
}

interface CreditPackage {
  id: string;
  name: string;
  description: string | null;
  credits: number;
  price: string;
  razorpayPrice: string | null;
  paypalPrice: string | null;
  paystackPrice: string | null;
  mercadopagoPrice: string | null;
  isActive: boolean;
  stripePriceId: string | null;
}

interface CreditTransaction {
  id: string;
  type: string;
  amount: number;
  description: string;
  createdAt: string;
  stripePaymentId: string | null;
}

interface CreditBalanceBreakdown {
  totalCredits: number;
  bucketCredits: number;
  legacyCredits: number;
  buckets: Array<{
    id: string;
    sourceType: string;
    remainingCredits: number;
    expiresAt: string | null;
    status: string;
  }>;
}

function formatSupportTierLabel(supportTier?: string): string | null {
  if (!supportTier || supportTier === "community") return null;
  const map: Record<string, string> = {
    email: "Email support",
    priority: "Priority support",
    dedicated: "Dedicated support",
    sla: "SLA-backed support",
  };
  return map[supportTier] || `${supportTier} support`;
}

export default function Billing() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [loadingCheckout, setLoadingCheckout] = useState<string | null>(null);
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(
    null,
  );
  const [selectedCurrency, setSelectedCurrency] = useState<string>("");

  const currencySymbols: Record<string, string> = {
    USD: "$",
    EUR: "€",
    GBP: "£",
    CAD: "C$",
    AUD: "A$",
    JPY: "¥",
    INR: "₹",
    BRL: "R$",
    MXN: "$",
    CHF: "CHF",
    NGN: "₦",
    GHS: "₵",
    ZAR: "R",
    KES: "KSh",
    ARS: "$",
    CLP: "$",
    COP: "$",
    PEN: "S/",
    UYU: "$",
  };

  const currencyNames: Record<string, string> = {
    USD: "US Dollar",
    EUR: "Euro",
    GBP: "British Pound",
    CAD: "Canadian Dollar",
    AUD: "Australian Dollar",
    JPY: "Japanese Yen",
    INR: "Indian Rupee",
    BRL: "Brazilian Real",
    MXN: "Mexican Peso",
    CHF: "Swiss Franc",
    NGN: "Nigerian Naira",
    GHS: "Ghanaian Cedi",
    ZAR: "South African Rand",
    KES: "Kenyan Shilling",
    ARS: "Argentine Peso",
    CLP: "Chilean Peso",
    COP: "Colombian Peso",
    PEN: "Peruvian Sol",
    UYU: "Uruguayan Peso",
  };

  const { data: user, isLoading: userLoading } = useQuery<User>({
    queryKey: ["/api/auth/me"],
  });

  const { data: paymentGateway, isLoading: gatewayLoading } =
    useQuery<PaymentGatewayConfig>({
      queryKey: ["/api/settings/payment-gateway"],
    });

  const { data: plans, isLoading: plansLoading } = useQuery<Plan[]>({
    queryKey: ["/api/plans"],
  });

  const { data: subscription, isLoading: subscriptionLoading } =
    useQuery<UserSubscription | null>({
      queryKey: ["/api/user-subscription"],
    });

  const { data: packages, isLoading: packagesLoading } = useQuery<
    CreditPackage[]
  >({
    queryKey: ["/api/credit-packages"],
  });

  const { data: transactions, isLoading: transactionsLoading } = useQuery<
    CreditTransaction[]
  >({
    queryKey: ["/api/credit-transactions"],
  });

  const { data: creditBreakdown } = useQuery<CreditBalanceBreakdown>({
    queryKey: ["/api/credits/balance-breakdown"],
  });

  const buildAvailableCurrencies = (): CurrencyOption[] => {
    if (!paymentGateway) return [];

    const currencyMap = new Map<string, GatewayType[]>();

    if (paymentGateway.stripeEnabled && paymentGateway.stripeCurrency) {
      const curr = paymentGateway.stripeCurrency.toUpperCase();
      currencyMap.set(curr, [...(currencyMap.get(curr) || []), "stripe"]);
    }

    if (paymentGateway.razorpayEnabled) {
      currencyMap.set("INR", [...(currencyMap.get("INR") || []), "razorpay"]);
    }

    if (paymentGateway.paypalEnabled && paymentGateway.paypalCurrency) {
      const curr = paymentGateway.paypalCurrency.toUpperCase();
      currencyMap.set(curr, [...(currencyMap.get(curr) || []), "paypal"]);
    }

    if (paymentGateway.paystackEnabled && paymentGateway.paystackCurrency) {
      const curr = paymentGateway.paystackCurrency.toUpperCase();
      currencyMap.set(curr, [...(currencyMap.get(curr) || []), "paystack"]);
    }

    if (
      paymentGateway.mercadopagoEnabled &&
      paymentGateway.mercadopagoCurrency
    ) {
      const curr = paymentGateway.mercadopagoCurrency.toUpperCase();
      currencyMap.set(curr, [...(currencyMap.get(curr) || []), "mercadopago"]);
    }

    return Array.from(currencyMap.entries()).map(([code, gateways]) => ({
      code,
      symbol: currencySymbols[code] || code,
      name: currencyNames[code] || code,
      gateways,
    }));
  };

  const getGatewayForCurrency = (currencyCode: string): GatewayType | null => {
    const currencies = buildAvailableCurrencies();
    const currency = currencies.find((c) => c.code === currencyCode);
    if (!currency || currency.gateways.length === 0) return null;
    if (currency.gateways.includes("stripe")) return "stripe";
    return currency.gateways[0];
  };

  const getPackagePrice = (
    pkg: CreditPackage,
    currencyCode: string,
  ): { price: string; symbol: string } => {
    const gateway = getGatewayForCurrency(currencyCode);
    const symbol = currencySymbols[currencyCode] || "$";

    switch (gateway) {
      case "razorpay":
        return { price: pkg.razorpayPrice || pkg.price, symbol };
      case "paypal":
        return { price: pkg.paypalPrice || pkg.price, symbol };
      case "paystack":
        return { price: pkg.paystackPrice || pkg.price, symbol };
      case "mercadopago":
        return { price: pkg.mercadopagoPrice || pkg.price, symbol };
      default:
        return {
          price: pkg.price,
          symbol: paymentGateway?.stripeCurrencySymbol || "$",
        };
    }
  };

  useEffect(() => {
    if (paymentGateway && !selectedCurrency) {
      const currencies = buildAvailableCurrencies();
      if (currencies.length > 0) {
        if (paymentGateway.stripeEnabled && paymentGateway.stripeCurrency) {
          setSelectedCurrency(paymentGateway.stripeCurrency.toUpperCase());
        } else {
          setSelectedCurrency(currencies[0].code);
        }
      }
    }
  }, [paymentGateway]);

  useEffect(() => {
    const handlePaymentRedirect = async () => {
      const params = new URLSearchParams(window.location.search);

      const stripeSessionId = params.get("session_id");
      const stripeSuccess = params.get("success");
      const paypalSubscription = params.get("paypal_subscription");
      const paypalSubscriptionId = params.get("subscription_id");
      const paystackSubscription = params.get("paystack_subscription");
      const paystackCredits = params.get("paystack_credits");
      const mercadopago = params.get("mercadopago");
      const mercadopagoSubscription = params.get("mercadopago_subscription");
      const mercadopagoPreapprovalId = params.get("preapproval_id");
      const reference = params.get("reference");
      const packageId = params.get("package_id");
      const planId = params.get("plan_id");
      const billingPeriod = params.get("billing_period");
      const paymentId = params.get("payment_id");

      const clearUrlParams = () => {
        window.history.replaceState({}, "", window.location.pathname);
      };

      try {
        if (stripeSuccess === "true" && stripeSessionId) {
          const response = await apiRequest(
            "POST",
            "/api/stripe/verify-session",
            { sessionId: stripeSessionId },
          );
          if (response.ok) {
            toast({
              title: t("billing.toast.paymentSuccess"),
              description: t("billing.toast.paymentSuccessDesc"),
            });
            queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
            queryClient.invalidateQueries({
              queryKey: ["/api/user-subscription"],
            });
            queryClient.invalidateQueries({
              queryKey: ["/api/credit-transactions"],
            });
          }
          clearUrlParams();
        } else if (paystackSubscription === "success" && reference) {
          const response = await apiRequest(
            "POST",
            "/api/paystack/verify-subscription",
            { reference },
          );
          if (response.ok) {
            toast({
              title: t("billing.toast.subscriptionSuccess"),
              description: t("billing.toast.subscriptionSuccessDesc"),
            });
            queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
            queryClient.invalidateQueries({
              queryKey: ["/api/user-subscription"],
            });
          }
          clearUrlParams();
        } else if (paystackCredits === "success" && reference && packageId) {
          const response = await apiRequest(
            "POST",
            "/api/paystack/verify-credits",
            { reference, packageId },
          );
          if (response.ok) {
            toast({
              title: t("billing.toast.paymentSuccess"),
              description: t("billing.toast.paymentSuccessDesc"),
            });
            queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
            queryClient.invalidateQueries({
              queryKey: ["/api/credit-transactions"],
            });
          }
          clearUrlParams();
        } else if (mercadopago === "success" && paymentId) {
          const response = await apiRequest(
            "POST",
            "/api/mercadopago/verify-payment",
            { paymentId },
          );
          if (response.ok) {
            toast({
              title: t("billing.toast.paymentSuccess"),
              description: t("billing.toast.paymentSuccessDesc"),
            });
            queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
            queryClient.invalidateQueries({
              queryKey: ["/api/credit-transactions"],
            });
          }
          clearUrlParams();
        } else if (
          mercadopagoSubscription === "success" &&
          mercadopagoPreapprovalId &&
          planId
        ) {
          const response = await apiRequest(
            "POST",
            "/api/mercadopago/confirm-subscription",
            {
              subscriptionId: mercadopagoPreapprovalId,
              planId,
              billingPeriod: billingPeriod || "monthly",
            },
          );
          if (response.ok) {
            toast({
              title: t("billing.toast.subscriptionSuccess"),
              description: t("billing.toast.subscriptionSuccessDesc"),
            });
            queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
            queryClient.invalidateQueries({
              queryKey: ["/api/user-subscription"],
            });
          } else {
            const error = await response.json();
            throw new Error(error.error || "Subscription confirmation failed");
          }
          clearUrlParams();
        } else if (
          paypalSubscription === "success" &&
          paypalSubscriptionId &&
          planId
        ) {
          const response = await apiRequest(
            "POST",
            "/api/paypal/confirm-subscription",
            {
              subscriptionId: paypalSubscriptionId,
              planId,
              billingPeriod: billingPeriod || "monthly",
            },
          );
          if (response.ok) {
            toast({
              title: t("billing.toast.subscriptionSuccess"),
              description: t("billing.toast.subscriptionSuccessDesc"),
            });
            queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
            queryClient.invalidateQueries({
              queryKey: ["/api/user-subscription"],
            });
          } else {
            const error = await response.json();
            throw new Error(error.error || "Subscription confirmation failed");
          }
          clearUrlParams();
        } else if (mercadopago === "failed" || mercadopago === "pending") {
          toast({
            title:
              mercadopago === "pending" ? "Payment Pending" : "Payment Failed",
            description:
              mercadopago === "pending"
                ? "Your payment is being processed."
                : "Your payment could not be completed.",
            variant: mercadopago === "failed" ? "destructive" : "default",
          });
          clearUrlParams();
        }
      } catch (error: any) {
        console.error("Payment verification error:", error);
        toast({
          title: "Verification Failed",
          description:
            error.message ||
            "Could not verify your payment. Please contact support.",
          variant: "destructive",
        });
        clearUrlParams();
      }
    };

    handlePaymentRedirect();
  }, []);

  const cancelMutation = useMutation({
    mutationFn: async () => {
      // Determine which gateway to use based on the subscription
      let endpoint: string;
      if (subscription?.razorpaySubscriptionId) {
        endpoint = "/api/razorpay/cancel-subscription";
      } else if (subscription?.paypalSubscriptionId) {
        endpoint = "/api/paypal/cancel-subscription";
      } else if (subscription?.paystackSubscriptionCode) {
        endpoint = "/api/paystack/cancel-subscription";
      } else if (subscription?.mercadopagoSubscriptionId) {
        endpoint = "/api/mercadopago/cancel-subscription";
      } else {
        endpoint = "/api/stripe/cancel-subscription";
      }

      const response = await apiRequest("POST", endpoint);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to cancel subscription");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t("billing.subscriptionCancelled"),
        description: t("billing.subscriptionCancelledMessage"),
      });
      setCancelDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/user-subscription"] });
    },
    onError: (error: any) => {
      toast({
        title: t("billing.cancelFailed"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handlePurchaseCredits = (packageId: string) => {
    setSelectedPackageId(packageId);
    setPurchaseDialogOpen(true);
  };

  const handlePurchaseSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    queryClient.invalidateQueries({ queryKey: ["/api/credit-transactions"] });
  };

  const handleExportTransactions = () => {
    window.open("/api/credit-transactions/export", "_blank");
  };

  if (
    userLoading ||
    plansLoading ||
    subscriptionLoading ||
    packagesLoading ||
    transactionsLoading ||
    gatewayLoading
  ) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currentBalance = user?.credits || 0;
  const hasActiveSubscription =
    subscription && subscription.status === "active";

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900/80 via-slate-800/50 to-indigo-950/40 border border-border p-6 md:p-8">
        <div className="absolute inset-0 bg-grid-slate-700/20 [mask-image:linear-gradient(0deg,transparent,rgba(255,255,255,0.5))]" />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-slate-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <CircleDollarSign className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                {t("billing.title")}
              </h1>
              <p className="text-muted-foreground mt-0.5">
                {t("billing.subtitle")}
              </p>
            </div>
          </div>
        </div>

        <div className="relative mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-border/50">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-muted-foreground" />
              <div
                className="text-2xl font-bold text-foreground"
                data-testid="text-header-balance"
              >
                {currentBalance.toLocaleString()}
              </div>
            </div>
            <div className="text-muted-foreground/70 text-sm">
              {t("billing.currentBalance")}
            </div>
            {(user?.rolloverCredits ?? 0) > 0 && (
              <div className="text-muted-foreground/70 text-xs mt-1">
                Rollover Credits: {user!.rolloverCredits!.toLocaleString()}
              </div>
            )}
            {hasActiveSubscription && (
              <div className="text-muted-foreground/50 text-xs mt-1">
                Credits expire at period end
              </div>
            )}
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-border/50">
            <div className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-indigo-400" />
              <div className="text-2xl font-bold text-indigo-400">
                {subscription?.plan.displayName || t("billing.free")}
              </div>
            </div>
            <div className="text-indigo-400/70 text-sm">
              {t("billing.currentPlan")}
            </div>
            {subscription?.plan && (
              <div className="text-indigo-400/60 text-xs mt-1">
                {subscription.plan.includedCredits.toLocaleString()} monthly credits
                {subscription.plan.signupBonusCredits
                  ? ` • ${subscription.plan.signupBonusCredits.toLocaleString()} one-time signup bonus`
                  : ""}
                {subscription.plan.creditRolloverCap
                  ? ` • ${subscription.plan.creditRolloverMonths || 0}m rollover (${subscription.plan.creditRolloverCap.toLocaleString()} cap)`
                  : ""}
                {formatSupportTierLabel(subscription.plan.supportTier)
                  ? ` • ${formatSupportTierLabel(subscription.plan.supportTier)}`
                  : ""}
              </div>
            )}
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-border/50">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              <div className="text-2xl font-bold text-foreground">
                {transactions?.length || 0}
              </div>
            </div>
            <div className="text-muted-foreground/70 text-sm">
              {t("billing.transactions")}
            </div>
            {creditBreakdown && (
              <div className="text-muted-foreground/60 text-xs mt-1">
                Bucketed: {creditBreakdown.bucketCredits.toLocaleString()} • Legacy:{" "}
                {creditBreakdown.legacyCredits.toLocaleString()}
              </div>
            )}
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-border/50">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-400" />
              <div className="text-2xl font-bold text-emerald-400 capitalize">
                {subscription?.status || t("common.active")}
              </div>
            </div>
            <div className="text-emerald-400/70 text-sm">
              {t("common.status")}
            </div>
          </div>
        </div>
      </div>

      {subscription &&
        hasActiveSubscription &&
        !subscription.cancelAtPeriodEnd &&
        subscription.plan.name !== "free" &&
        (subscription.stripeSubscriptionId ||
          subscription.razorpaySubscriptionId ||
          subscription.paypalSubscriptionId ||
          subscription.paystackSubscriptionCode ||
          subscription.mercadopagoSubscriptionId) && (
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-950/40 via-slate-800/80 to-purple-950/30 border border-indigo-700/30 p-6">
            <div className="absolute inset-0 bg-grid-indigo-700/10 [mask-image:linear-gradient(0deg,transparent,rgba(255,255,255,0.5))]" />
            <div className="relative">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                  <CalendarCheck className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">
                  {t("billing.subscriptionPeriod") || "Subscription Period"}
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white/10 rounded-xl p-4 border border-indigo-800/30">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="h-4 w-4 text-indigo-400" />
                    <span className="text-sm font-medium text-indigo-400">
                      {t("billing.startDate") || "Start Date"}
                    </span>
                  </div>
                  <div
                    className="text-xl font-bold text-foreground"
                    data-testid="text-subscription-start-date"
                  >
                    {subscription.currentPeriodStart
                      ? format(
                          new Date(subscription.currentPeriodStart),
                          "MMM dd, yyyy",
                        )
                      : "-"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {subscription.currentPeriodStart
                      ? formatDistanceToNow(
                          new Date(subscription.currentPeriodStart),
                          { addSuffix: true },
                        )
                      : ""}
                  </div>
                </div>
                <div className="bg-white/10 rounded-xl p-4 border border-purple-800/30">
                  <div className="flex items-center gap-2 mb-1">
                    <CalendarCheck className="h-4 w-4 text-purple-400" />
                    <span className="text-sm font-medium text-purple-400">
                      {t("billing.renewalDate") || "Renewal Date"}
                    </span>
                  </div>
                  <div
                    className="text-xl font-bold text-foreground"
                    data-testid="text-subscription-end-date"
                  >
                    {subscription.currentPeriodEnd
                      ? format(
                          new Date(subscription.currentPeriodEnd),
                          "MMM dd, yyyy",
                        )
                      : "-"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {subscription.currentPeriodEnd
                      ? formatDistanceToNow(
                          new Date(subscription.currentPeriodEnd),
                          { addSuffix: true },
                        )
                      : ""}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      {subscription &&
        subscription.plan.name !== "free" &&
        !subscription.cancelAtPeriodEnd &&
        (subscription.stripeSubscriptionId ||
          subscription.razorpaySubscriptionId ||
          subscription.paypalSubscriptionId ||
          subscription.paystackSubscriptionCode ||
          subscription.mercadopagoSubscriptionId) && (
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => setCancelDialogOpen(true)}
              data-testid="button-cancel-subscription"
            >
              {t("billing.cancelSubscription")}
            </Button>
          </div>
        )}

      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800/80 to-indigo-950/30 border border-border p-6 md:p-8">
        <div className="absolute inset-0 bg-grid-slate-700/20 [mask-image:linear-gradient(0deg,transparent,rgba(255,255,255,0.5))]" />
        <div className="relative">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-6">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-600/20">
                <Coins className="h-7 w-7 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">
                  {t("billing.creditsAndUsage")}
                </h2>
                <p className="text-muted-foreground text-sm">
                  {t("billing.creditsSubtitle")}
                </p>
              </div>
            </div>

            {buildAvailableCurrencies().length > 1 && (
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <Select
                  value={selectedCurrency}
                  onValueChange={setSelectedCurrency}
                >
                  <SelectTrigger
                    className="w-[140px] bg-white/10"
                    data-testid="select-billing-currency"
                  >
                    <SelectValue placeholder="Currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {buildAvailableCurrencies().map((currency) => (
                      <SelectItem key={currency.code} value={currency.code}>
                        {currency.symbol} {currency.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {!hasActiveSubscription && (
            <Alert className="mb-6 border-amber-800/50 bg-amber-950/30">
              <AlertCircle className="h-4 w-4 text-amber-400" />
              <AlertDescription className="text-amber-300">
                {t("billing.membershipRequired")}
              </AlertDescription>
            </Alert>
          )}

          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-border/50 mb-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div className="flex items-center gap-6">
                <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center shadow-lg">
                  <CircleDollarSign className="h-10 w-10 text-white" />
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">
                    {t("billing.currentBalance")}
                  </div>
                  <div
                    className="text-5xl font-bold font-mono tabular-nums text-foreground"
                    data-testid="text-credit-balance"
                  >
                    {currentBalance.toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    {t("billing.availableCredits")}
                  </div>
                </div>
              </div>
              <Button
                size="lg"
                onClick={() =>
                  packages &&
                  packages[0] &&
                  handlePurchaseCredits(packages[0].id)
                }
                disabled={!hasActiveSubscription || !!loadingCheckout}
                className="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 shadow-lg shadow-emerald-500/25"
                data-testid="button-recharge-credits"
              >
                <Plus className="h-5 w-5 mr-2" />
                {t("billing.purchaseCredits")}
              </Button>
            </div>
          </div>

          {packages && packages.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-indigo-400" />
                {t("billing.creditPackages")}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {packages.map((pkg, index) => {
                  const priceInfo = getPackagePrice(pkg, selectedCurrency);
                  const displayPrice = parseFloat(priceInfo.price);
                  const currencySymbol = priceInfo.symbol;
                  const isPopular = index === 1;

                  return (
                    <div
                      key={pkg.id}
                      className={`relative bg-card rounded-xl border overflow-hidden transition-all duration-200 hover:shadow-lg ${
                        isPopular
                          ? "ring-2 ring-indigo-400 border-indigo-800"
                          : "border-border hover:border-slate-600"
                      }`}
                      data-testid={`card-package-${pkg.name.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      {isPopular && (
                        <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white text-xs font-medium py-1.5 text-center">
                          <Sparkles className="h-3 w-3 inline mr-1" />
                          {t("billing.popular")}
                        </div>
                      )}
                      <div className={`p-5 ${isPopular ? "pt-9" : ""}`}>
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <h4 className="text-lg font-semibold text-foreground">
                              {pkg.name}
                            </h4>
                            {pkg.description && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {pkg.description}
                              </p>
                            )}
                          </div>
                          <div
                            className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                              isPopular ? "bg-indigo-900/50" : "bg-slate-700/50"
                            }`}
                          >
                            <Coins
                              className={`h-5 w-5 ${
                                isPopular
                                  ? "text-indigo-400"
                                  : "text-muted-foreground"
                              }`}
                            />
                          </div>
                        </div>

                        <div className="mb-4">
                          <div className="text-3xl font-bold text-foreground">
                            {currencySymbol}
                            {displayPrice.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-xl font-mono font-semibold text-emerald-400">
                              {pkg.credits.toLocaleString()}
                            </span>
                          <span className="text-sm text-muted-foreground">
                            credits
                          </span>
                        </div>
                        </div>

                        <div className="flex items-center gap-2 mb-4 text-xs text-muted-foreground">
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                          {currencySymbol}
                          {(displayPrice / pkg.credits).toLocaleString(
                            undefined,
                            {
                              minimumFractionDigits: 4,
                              maximumFractionDigits: 4,
                            },
                          )}{" "}
                          per credit
                        </div>

                        <Button
                          className={`w-full ${
                            isPopular
                              ? "bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800"
                              : ""
                          }`}
                          variant={isPopular ? "default" : "outline"}
                          onClick={() => handlePurchaseCredits(pkg.id)}
                          disabled={!hasActiveSubscription || !!loadingCheckout}
                          data-testid={`button-buy-${pkg.name.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          {loadingCheckout === `package-${pkg.id}` ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              {t("billing.purchase")}
                              <ArrowUpRight className="h-4 w-4 ml-1" />
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800/80 to-slate-900/50 border border-border p-6 md:p-8">
        <div className="absolute inset-0 bg-grid-slate-700/20 [mask-image:linear-gradient(0deg,transparent,rgba(255,255,255,0.5))]" />
        <div className="relative">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center shadow-lg shadow-slate-600/20">
                <Receipt className="h-7 w-7 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">
                  {t("billing.transactionHistory")}
                </h2>
                <p className="text-muted-foreground text-sm">
                  {t("billing.transactionSubtitle") ||
                    "View your credit transactions and payment history"}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={handleExportTransactions}
              data-testid="button-export-transactions"
              className="border-border hover:bg-muted"
            >
              <Download className="h-4 w-4 mr-2" />
              {t("billing.exportCSV")}
            </Button>
          </div>

          {transactions && transactions.length > 0 ? (
            <div className="bg-card rounded-xl border border-border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 border-b border-border">
                    <TableHead className="font-semibold uppercase text-xs text-muted-foreground tracking-wider">
                      {t("billing.tableHeaders.type")}
                    </TableHead>
                    <TableHead className="font-semibold uppercase text-xs text-muted-foreground tracking-wider">
                      {t("billing.tableHeaders.description")}
                    </TableHead>
                    <TableHead className="font-semibold uppercase text-xs text-muted-foreground tracking-wider text-right">
                      {t("billing.tableHeaders.amount")}
                    </TableHead>
                    <TableHead className="font-semibold uppercase text-xs text-muted-foreground tracking-wider">
                      {t("billing.tableHeaders.date")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...transactions]
                    .sort(
                      (a, b) =>
                        new Date(b.createdAt).getTime() -
                        new Date(a.createdAt).getTime(),
                    )
                    .map((transaction, index) => (
                      <TableRow
                        key={transaction.id}
                        className={`transition-colors hover:bg-muted/30 ${
                          index !== transactions.length - 1
                            ? "border-b border-border/50"
                            : ""
                        }`}
                      >
                        <TableCell className="py-4">
                          <Badge
                            variant={
                              transaction.type === "credit"
                                ? "default"
                                : "destructive"
                            }
                            className={`${
                              transaction.type === "credit"
                                ? "bg-emerald-900/50 text-emerald-400 hover:bg-emerald-900/50 border border-emerald-800"
                                : "bg-red-900/50 text-red-400 hover:bg-red-900/50 border border-red-800"
                            }`}
                          >
                            {transaction.type === "credit" ? (
                              <>
                                <Plus className="h-3 w-3 mr-1" />
                                {t("billing.credit")}
                              </>
                            ) : (
                              <>{t("billing.debit")}</>
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-4">
                          <div className="font-medium text-sm text-foreground">
                            {transaction.description}
                          </div>
                          {transaction.stripePaymentId && (
                            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                              <CreditCard className="h-3 w-3" />
                              {transaction.stripePaymentId.substring(0, 20)}...
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="py-4 text-right">
                          <span
                            className={`font-mono text-sm font-bold ${
                              transaction.type === "credit"
                                ? "text-emerald-400"
                                : "text-red-400"
                            }`}
                          >
                            {transaction.type === "credit" ? "+" : "-"}
                            {Math.abs(transaction.amount).toLocaleString()}
                          </span>
                        </TableCell>
                        <TableCell className="py-4">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" />
                            {formatDistanceToNow(
                              new Date(transaction.createdAt),
                              { addSuffix: true },
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="bg-white/10 rounded-xl border border-border/50 p-12 text-center">
              <div className="h-16 w-16 rounded-2xl bg-slate-700/50 flex items-center justify-center mx-auto mb-4">
                <Receipt className="h-8 w-8 text-slate-500" />
              </div>
              <p className="text-muted-foreground">
                {t("billing.noTransactions")}
              </p>
            </div>
          )}
        </div>
      </div>

      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent data-testid="dialog-cancel-subscription">
          <DialogHeader>
            <DialogTitle>{t("billing.cancelConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("billing.cancelConfirmMessage")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelDialogOpen(false)}
            >
              {t("billing.keepSubscription")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              data-testid="button-confirm-cancel"
            >
              {cancelMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("billing.cancelSubscription")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
