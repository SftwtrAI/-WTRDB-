import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal,
  UserCheck,
  UserX,
  CreditCard,
  Download,
  Loader2,
  Gift,
  UserPlus,
  Trash2,
  AlertTriangle,
  Shield,
  ShieldCheck,
  ShieldX,
  FileCheck,
  Eye,
  ExternalLink,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import Papa from "papaparse";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { format } from "date-fns";
import { Pagination } from "@/components/Pagination";
import { useTranslation } from "react-i18next";
import { AuthStorage } from "@/lib/auth-storage";

interface Plan {
  id: string;
  name: string;
  displayName: string;
  isActive: boolean;
}

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  credits: number;
  planType: string;
  isActive: boolean;
  createdAt: string;
  plan?: {
    displayName: string;
  };
  kycStatus?: "pending" | "submitted" | "approved" | "rejected" | null;
  kycSubmittedAt?: string | null;
  kycApprovedAt?: string | null;
  kycRejectionReason?: string | null;
}

interface KycDocument {
  id: string;
  userId: string;
  documentType: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
}

interface PaginatedResponse {
  data: User[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export default function UserManagement() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [editDialog, setEditDialog] = useState(false);
  const [promoCreditsDialog, setPromoCreditsDialog] = useState(false);
  const [createUserDialog, setCreateUserDialog] = useState(false);
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({
    credits: 0,
    role: "user",
    planType: "free",
  });
  const [createUserForm, setCreateUserForm] = useState({
    email: "",
    password: "",
    name: "",
    role: "user",
    planType: "free",
    credits: 0,
    isActive: true,
  });
  const [promoCreditsAmount, setPromoCreditsAmount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [isExporting, setIsExporting] = useState(false);
  const [kycReviewDialog, setKycReviewDialog] = useState(false);
  const [kycUser, setKycUser] = useState<User | null>(null);
  const [kycDocuments, setKycDocuments] = useState<KycDocument[]>([]);
  const [kycRejectionReason, setKycRejectionReason] = useState("");
  const [loadingKycDocs, setLoadingKycDocs] = useState(false);

  const {
    data: response,
    isLoading,
    refetch,
  } = useQuery<PaginatedResponse>({
    queryKey: [`/api/admin/users?page=${page}&pageSize=${pageSize}`],
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: plansData } = useQuery<Plan[]>({
    queryKey: ["/api/plans"],
  });

  const plans = plansData || [];

  const users = response?.data || [];
  const pagination = response?.pagination || {
    page: 1,
    pageSize: 25,
    totalItems: 0,
    totalPages: 1,
  };

  const updateUser = useMutation({
    mutationFn: async ({
      userId,
      updates,
    }: {
      userId: string;
      updates: any;
    }) => {
      return apiRequest("PATCH", `/api/admin/users/${userId}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: t("admin.users.userUpdated") });
      setEditDialog(false);
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: t("admin.users.updateFailed"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const addPromoCredits = useMutation({
    mutationFn: async ({
      userId,
      amount,
    }: {
      userId: string;
      amount: number;
    }) => {
      return apiRequest("POST", `/api/admin/users/${userId}/credits`, {
        amount,
        description: "Promo Credits",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: t("admin.users.promoCreditsAdded") });
      setPromoCreditsDialog(false);
      setPromoCreditsAmount(0);
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: t("admin.users.promoFailed"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createUser = useMutation({
    mutationFn: async (userData: typeof createUserForm) => {
      return apiRequest("POST", "/api/admin/users", userData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User created successfully" });
      setCreateUserDialog(false);
      setCreateUserForm({
        email: "",
        password: "",
        name: "",
        role: "user",
        planType: "free",
        credits: 0,
        isActive: true,
      });
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create user",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("DELETE", `/api/admin/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "User deleted successfully",
        description: "All user data has been permanently removed.",
      });
      setDeleteConfirmDialog(false);
      setSelectedUser(null);
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete user",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const approveKyc = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest(
        "POST",
        `/api/admin/users/${userId}/kyc/approve`,
      );
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to approve KYC");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "KYC Approved",
        description: "User can now purchase phone numbers.",
      });
      setKycReviewDialog(false);
      setKycUser(null);
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to approve KYC",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const rejectKyc = useMutation({
    mutationFn: async ({
      userId,
      reason,
    }: {
      userId: string;
      reason: string;
    }) => {
      const res = await apiRequest(
        "POST",
        `/api/admin/users/${userId}/kyc/reject`,
        { reason },
      );
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to reject KYC");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "KYC Rejected",
        description: "User has been notified to resubmit documents.",
      });
      setKycReviewDialog(false);
      setKycUser(null);
      setKycRejectionReason("");
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to reject KYC",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setPage(1);
  };

  const handleEdit = (user: User) => {
    setSelectedUser(user);
    setEditForm({
      credits: user.credits,
      role: user.role,
      planType: user.planType,
    });
    setEditDialog(true);
  };

  const handleSaveEdit = () => {
    if (!selectedUser) return;
    updateUser.mutate({
      userId: selectedUser.id,
      updates: editForm,
    });
  };

  const handleOpenPromoCredits = (user: User) => {
    setSelectedUser(user);
    setPromoCreditsAmount(0);
    setPromoCreditsDialog(true);
  };

  const handleAddPromoCredits = () => {
    if (!selectedUser || promoCreditsAmount <= 0) return;
    addPromoCredits.mutate({
      userId: selectedUser.id,
      amount: promoCreditsAmount,
    });
  };

  const toggleActive = (user: User) => {
    updateUser.mutate({
      userId: user.id,
      updates: { isActive: !user.isActive },
    });
  };

  const handleCreateUser = () => {
    if (
      !createUserForm.email ||
      !createUserForm.password ||
      !createUserForm.name
    ) {
      toast({
        title: "Missing required fields",
        description: "Please fill in email, password, and name.",
        variant: "destructive",
      });
      return;
    }
    createUser.mutate(createUserForm);
  };

  const handleOpenDeleteConfirm = (user: User) => {
    setSelectedUser(user);
    setDeleteConfirmDialog(true);
  };

  const handleConfirmDelete = () => {
    if (!selectedUser) return;
    deleteUser.mutate(selectedUser.id);
  };

  const handleOpenKycReview = async (user: User) => {
    setKycUser(user);
    setKycRejectionReason("");
    setLoadingKycDocs(true);
    setKycReviewDialog(true);

    try {
      const token = AuthStorage.getToken();
      const response = await fetch(
        `/api/admin/users/${user.id}/kyc/documents`,
        {
          headers: {
            Authorization: token ? `Bearer ${token}` : "",
          },
        },
      );
      if (response.ok) {
        const docs = await response.json();
        setKycDocuments(docs);
      } else {
        setKycDocuments([]);
      }
    } catch (error) {
      console.error("Error fetching KYC documents:", error);
      setKycDocuments([]);
    } finally {
      setLoadingKycDocs(false);
    }
  };

  const handleApproveKyc = () => {
    if (!kycUser) return;
    approveKyc.mutate(kycUser.id);
  };

  const handleRejectKyc = () => {
    if (!kycUser || !kycRejectionReason.trim()) {
      toast({
        title: "Rejection reason required",
        description: "Please provide a reason for rejecting the KYC documents.",
        variant: "destructive",
      });
      return;
    }
    rejectKyc.mutate({ userId: kycUser.id, reason: kycRejectionReason });
  };

  const getKycStatusBadge = (status?: string | null) => {
    switch (status) {
      case "approved":
        return (
          <Badge className="bg-green-900/30 text-green-400">
            <ShieldCheck className="h-3 w-3 mr-1" />
            Approved
          </Badge>
        );
      case "submitted":
        return (
          <Badge variant="secondary">
            <Shield className="h-3 w-3 mr-1" />
            Pending Review
          </Badge>
        );
      case "rejected":
        return (
          <Badge variant="destructive">
            <ShieldX className="h-3 w-3 mr-1" />
            Rejected
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-muted-foreground">
            Not Submitted
          </Badge>
        );
    }
  };

  const getDocumentTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      photo_id: "Photo ID",
      company_registration: "Company Registration",
      gst_certificate: "GST Certificate",
      authorization_letter: "Authorization Letter",
    };
    return labels[type] || type;
  };

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const response = await apiRequest(
        "GET",
        "/api/admin/users?page=1&pageSize=999999",
      );
      if (!response.ok) {
        throw new Error("Failed to fetch users for export");
      }

      const result = await response.json();
      const allUsers = result.data;

      const csvData = allUsers.map((user: User) => ({
        Name: user.name,
        Email: user.email,
        Role: user.role,
        Plan: user.plan?.displayName || user.planType,
        Credits: user.credits,
        Status: user.isActive ? "Active" : "Inactive",
        Admin: user.role === "admin" ? "Yes" : "No",
        Joined: user.createdAt
          ? format(new Date(user.createdAt), "yyyy-MM-dd HH:mm:ss")
          : "",
      }));

      const csv = Papa.unparse(csvData);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);

      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        `users-export-${format(new Date(), "yyyy-MM-dd-HHmmss")}.csv`,
      );
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: t("admin.users.exportSuccess"),
        description: t("admin.users.exportedUsers", { count: allUsers.length }),
      });
    } catch (error) {
      console.error("Export error:", error);
      toast({
        title: t("admin.users.exportFailed"),
        description: t("admin.users.exportFailedDesc"),
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold">
            {t("admin.users.title")}
          </h2>
          <p className="text-muted-foreground text-sm md:text-base">
            {t("admin.users.description")}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={() => setCreateUserDialog(true)}
            size="sm"
            data-testid="button-add-user"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Add User
          </Button>
          <Button
            onClick={handleExportCSV}
            variant="outline"
            size="sm"
            disabled={isExporting || users.length === 0}
            data-testid="button-export-users"
          >
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t("admin.users.exporting")}
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                {t("admin.users.exportCSV")}
              </>
            )}
          </Button>
          <Button
            onClick={() => refetch()}
            variant="outline"
            size="sm"
            data-testid="button-refresh-users"
          >
            {t("common.refresh")}
          </Button>
        </div>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableCaption>{t("admin.users.tableCaption")}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>{t("admin.users.columns.user")}</TableHead>
              <TableHead className="hidden sm:table-cell">
                {t("admin.users.columns.role")}
              </TableHead>
              <TableHead>{t("admin.users.columns.plan")}</TableHead>
              <TableHead>{t("admin.users.columns.credits")}</TableHead>
              <TableHead>KYC</TableHead>
              <TableHead>{t("admin.users.columns.status")}</TableHead>
              <TableHead className="hidden md:table-cell">
                {t("admin.users.columns.joined")}
              </TableHead>
              <TableHead className="text-right">
                {t("common.actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center">
                  {t("admin.users.loadingUsers")}
                </TableCell>
              </TableRow>
            ) : users?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center">
                  {t("admin.users.noUsersFound")}
                </TableCell>
              </TableRow>
            ) : (
              users?.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{user.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {user.email}
                      </div>
                      {user.role === "admin" && (
                        <Badge variant="secondary" className="mt-1">
                          Admin
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge
                      variant={user.role === "admin" ? "default" : "secondary"}
                    >
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={user.planType === "pro" ? "default" : "outline"}
                    >
                      {user.plan?.displayName || user.planType}
                    </Badge>
                  </TableCell>
                  <TableCell>{user.credits}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getKycStatusBadge(user.kycStatus)}
                      {user.kycStatus === "submitted" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2"
                          onClick={() => handleOpenKycReview(user)}
                          data-testid={`button-review-kyc-${user.id}`}
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={user.isActive ? "secondary" : "destructive"}
                    >
                      {user.isActive
                        ? t("common.active")
                        : t("admin.users.suspended")}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {format(new Date(user.createdAt), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          data-testid={`button-user-actions-${user.id}`}
                        >
                          <span className="sr-only">
                            {t("admin.users.openMenu")}
                          </span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>
                          {t("common.actions")}
                        </DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => handleEdit(user)}>
                          <CreditCard className="mr-2 h-4 w-4" />
                          {t("admin.users.editDetails")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleOpenPromoCredits(user)}
                          data-testid={`button-add-promo-${user.id}`}
                        >
                          <Gift className="mr-2 h-4 w-4" />
                          {t("admin.users.addPromoCredits")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => toggleActive(user)}>
                          {user.isActive ? (
                            <>
                              <UserX className="mr-2 h-4 w-4" />
                              {t("admin.users.suspendUser")}
                            </>
                          ) : (
                            <>
                              <UserCheck className="mr-2 h-4 w-4" />
                              {t("admin.users.activateUser")}
                            </>
                          )}
                        </DropdownMenuItem>
                        {user.role !== "admin" && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleOpenDeleteConfirm(user)}
                              className="text-destructive focus:text-destructive"
                              data-testid={`button-delete-user-${user.id}`}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete User
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Pagination
        currentPage={pagination.page}
        totalPages={pagination.totalPages}
        pageSize={pagination.pageSize}
        totalItems={pagination.totalItems}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
      />

      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.users.editUser")}</DialogTitle>
            <DialogDescription>
              {t("admin.users.updateDetails")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("admin.users.columns.credits")}</Label>
              <Input
                type="number"
                value={editForm.credits}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    credits: parseInt(e.target.value) || 0,
                  })
                }
                data-testid="input-user-credits"
              />
            </div>
            <div>
              <Label>{t("admin.users.columns.role")}</Label>
              <Select
                value={editForm.role}
                onValueChange={(value) =>
                  setEditForm({ ...editForm, role: value })
                }
              >
                <SelectTrigger data-testid="select-user-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">
                    {t("admin.users.roles.user")}
                  </SelectItem>
                  <SelectItem value="manager">
                    {t("admin.users.roles.manager")}
                  </SelectItem>
                  <SelectItem value="admin">
                    {t("admin.users.roles.admin")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("admin.users.columns.plan")}</Label>
              <Select
                value={editForm.planType}
                onValueChange={(value) =>
                  setEditForm({ ...editForm, planType: value })
                }
              >
                <SelectTrigger data-testid="select-user-plan">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {plans
                    .filter((p) => p.isActive)
                    .map((plan) => (
                      <SelectItem key={plan.id} value={plan.name}>
                        {plan.displayName}
                      </SelectItem>
                    ))}
                  {plans.filter((p) => p.isActive).length === 0 && (
                    <>
                      <SelectItem value="free">
                        {t("admin.users.plans.free")}
                      </SelectItem>
                      <SelectItem value="pro">
                        {t("admin.users.plans.pro")}
                      </SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSaveEdit} data-testid="button-save-user">
              {t("admin.users.saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={promoCreditsDialog} onOpenChange={setPromoCreditsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.users.promoCreditsTitle")}</DialogTitle>
            <DialogDescription>
              {t("admin.users.promoCreditsDescription", {
                name: selectedUser?.name || selectedUser?.email,
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("admin.users.creditAmount")}</Label>
              <Input
                type="number"
                min="1"
                value={promoCreditsAmount}
                onChange={(e) =>
                  setPromoCreditsAmount(parseInt(e.target.value) || 0)
                }
                placeholder={t("admin.users.enterCreditAmount")}
                data-testid="input-promo-credits"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t("admin.users.creditExplanation")}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPromoCreditsDialog(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleAddPromoCredits}
              disabled={promoCreditsAmount <= 0 || addPromoCredits.isPending}
              data-testid="button-confirm-promo-credits"
            >
              {addPromoCredits.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Gift className="h-4 w-4 mr-2" />
              )}
              {t("admin.users.addCredits")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create User Dialog */}
      <Dialog open={createUserDialog} onOpenChange={setCreateUserDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
            <DialogDescription>
              Add a new user to the platform. They will receive login
              credentials.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input
                value={createUserForm.name}
                onChange={(e) =>
                  setCreateUserForm({ ...createUserForm, name: e.target.value })
                }
                placeholder="John Doe"
                data-testid="input-create-name"
              />
            </div>
            <div>
              <Label>Email *</Label>
              <Input
                type="email"
                value={createUserForm.email}
                onChange={(e) =>
                  setCreateUserForm({
                    ...createUserForm,
                    email: e.target.value,
                  })
                }
                placeholder="john@example.com"
                data-testid="input-create-email"
              />
            </div>
            <div>
              <Label>Password *</Label>
              <Input
                type="password"
                value={createUserForm.password}
                onChange={(e) =>
                  setCreateUserForm({
                    ...createUserForm,
                    password: e.target.value,
                  })
                }
                placeholder="Minimum 6 characters"
                data-testid="input-create-password"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Role</Label>
                <Select
                  value={createUserForm.role}
                  onValueChange={(value) =>
                    setCreateUserForm({ ...createUserForm, role: value })
                  }
                >
                  <SelectTrigger data-testid="select-create-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Plan</Label>
                <Select
                  value={createUserForm.planType}
                  onValueChange={(value) =>
                    setCreateUserForm({ ...createUserForm, planType: value })
                  }
                >
                  <SelectTrigger data-testid="select-create-plan">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {plans
                      .filter((p) => p.isActive)
                      .map((plan) => (
                        <SelectItem key={plan.id} value={plan.name}>
                          {plan.displayName}
                        </SelectItem>
                      ))}
                    {plans.filter((p) => p.isActive).length === 0 && (
                      <>
                        <SelectItem value="free">Free</SelectItem>
                        <SelectItem value="pro">Pro</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Initial Credits</Label>
              <Input
                type="number"
                min="0"
                value={createUserForm.credits}
                onChange={(e) =>
                  setCreateUserForm({
                    ...createUserForm,
                    credits: parseInt(e.target.value) || 0,
                  })
                }
                data-testid="input-create-credits"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateUserDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateUser}
              disabled={createUser.isPending}
              data-testid="button-create-user-submit"
            >
              {createUser.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <UserPlus className="h-4 w-4 mr-2" />
              )}
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteConfirmDialog}
        onOpenChange={setDeleteConfirmDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete User Permanently
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Are you sure you want to permanently delete{" "}
                <strong>{selectedUser?.name}</strong> ({selectedUser?.email})?
              </p>
              <p className="text-destructive font-medium">
                This action cannot be undone. All associated data will be
                permanently removed:
              </p>
              <ul className="list-disc list-inside text-sm space-y-1 ml-2">
                <li>Agents and voice configurations</li>
                <li>Campaigns and contacts</li>
                <li>Call history and recordings</li>
                <li>Flows and automations</li>
                <li>Knowledge base documents</li>
                <li>Subscriptions and credit history</li>
                <li>All other user data</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteUser.isPending}
              data-testid="button-confirm-delete-user"
            >
              {deleteUser.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* KYC Review Dialog */}
      <Dialog open={kycReviewDialog} onOpenChange={setKycReviewDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              KYC Document Review
            </DialogTitle>
            <DialogDescription>
              Review KYC documents for {kycUser?.name} ({kycUser?.email})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {loadingKycDocs ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : kycDocuments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No documents uploaded yet.
              </div>
            ) : (
              <div className="space-y-3">
                {kycDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <FileCheck className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">
                          {getDocumentTypeLabel(doc.documentType)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {doc.fileName}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          const token = AuthStorage.getToken();
                          const response = await fetch(
                            `/api/admin/kyc/documents/${doc.id}/download`,
                            {
                              headers: {
                                Authorization: `Bearer ${token}`,
                              },
                            },
                          );
                          if (!response.ok) {
                            throw new Error("Failed to fetch document");
                          }
                          const blob = await response.blob();
                          const url = URL.createObjectURL(blob);
                          window.open(url, "_blank");
                        } catch (error) {
                          toast({
                            title: "Error",
                            description: "Failed to open document",
                            variant: "destructive",
                          });
                        }
                      }}
                      data-testid={`button-view-doc-${doc.id}`}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {kycUser?.kycStatus === "submitted" && (
              <div className="space-y-4 pt-4 border-t">
                <div>
                  <Label>Rejection Reason (required if rejecting)</Label>
                  <Input
                    value={kycRejectionReason}
                    onChange={(e) => setKycRejectionReason(e.target.value)}
                    placeholder="Provide a reason if rejecting..."
                    data-testid="input-kyc-rejection-reason"
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setKycReviewDialog(false)}>
              Close
            </Button>
            {kycUser?.kycStatus === "submitted" && (
              <>
                <Button
                  variant="destructive"
                  onClick={handleRejectKyc}
                  disabled={rejectKyc.isPending || approveKyc.isPending}
                  data-testid="button-reject-kyc"
                >
                  {rejectKyc.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <ShieldX className="h-4 w-4 mr-2" />
                  )}
                  Reject
                </Button>
                <Button
                  onClick={handleApproveKyc}
                  disabled={approveKyc.isPending || rejectKyc.isPending}
                  className="bg-green-600 hover:bg-green-700"
                  data-testid="button-approve-kyc"
                >
                  {approveKyc.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <ShieldCheck className="h-4 w-4 mr-2" />
                  )}
                  Approve
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
