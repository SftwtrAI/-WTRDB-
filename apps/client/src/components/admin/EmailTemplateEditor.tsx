import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  Eye,
  Code,
  FileText,
  Plus,
  Variable,
  AlertCircle,
  Mail,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { EmailTemplate } from "@wtrops/shared";

const DEFAULT_VARIABLES = [
  "userName",
  "userEmail",
  "companyName",
  "code",
  "credits",
  "campaignName",
  "planName",
  "expiryDate",
  "amount",
  "phoneNumber",
];

interface EmailTemplateEditorProps {
  isOpen: boolean;
  onClose: () => void;
  template: EmailTemplate | null;
  onSave: (template: EmailTemplate) => void;
  templateType?: string;
}

export function EmailTemplateEditor({
  isOpen,
  onClose,
  template,
  onSave,
  templateType,
}: EmailTemplateEditorProps) {
  const { toast } = useToast();
  const { t } = useTranslation();

  const htmlBodyRef = useRef<HTMLTextAreaElement>(null);
  const textBodyRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    templateType: "",
    name: "",
    subject: "",
    htmlBody: "",
    textBody: "",
    variables: [] as string[],
    isActive: true,
  });

  const [activeTab, setActiveTab] = useState<"html" | "text">("html");
  const [showPreview, setShowPreview] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isEdit = !!template;

  useEffect(() => {
    if (isOpen) {
      if (template) {
        setFormData({
          templateType: template.templateType,
          name: template.name,
          subject: template.subject,
          htmlBody: template.htmlBody,
          textBody: template.textBody || "",
          variables: template.variables || DEFAULT_VARIABLES,
          isActive: template.isActive,
        });
      } else {
        setFormData({
          templateType: templateType || "",
          name: "",
          subject: "",
          htmlBody: getDefaultHtmlTemplate(),
          textBody: "",
          variables: DEFAULT_VARIABLES,
          isActive: true,
        });
      }
      setErrors({});
      setActiveTab("html");
      setShowPreview(false);
    }
  }, [isOpen, template, templateType]);

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("POST", "/api/admin/email-templates", data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/email-templates"],
      });
      toast({
        title: t("admin.notifications.emailTemplates.toast.createSuccess"),
        description: t(
          "admin.notifications.emailTemplates.toast.createSuccessDesc",
        ),
      });
      onSave(data);
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: t("admin.notifications.emailTemplates.toast.createFailed"),
        description: error.message || t("common.tryAgain"),
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest(
        "PUT",
        `/api/admin/email-templates/${template!.id}`,
        data,
      );
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/email-templates"],
      });
      toast({
        title: t("admin.notifications.emailTemplates.toast.updateSuccess"),
        description: t(
          "admin.notifications.emailTemplates.toast.updateSuccessDesc",
        ),
      });
      onSave(data);
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: t("admin.notifications.emailTemplates.toast.updateFailed"),
        description: error.message || t("common.tryAgain"),
        variant: "destructive",
      });
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.templateType.trim()) {
      newErrors.templateType = t(
        "admin.notifications.emailTemplates.errors.templateTypeRequired",
      );
    }

    if (!formData.name.trim()) {
      newErrors.name = t(
        "admin.notifications.emailTemplates.errors.nameRequired",
      );
    }

    if (!formData.subject.trim()) {
      newErrors.subject = t(
        "admin.notifications.emailTemplates.errors.subjectRequired",
      );
    }

    if (!formData.htmlBody.trim()) {
      newErrors.htmlBody = t(
        "admin.notifications.emailTemplates.errors.htmlBodyRequired",
      );
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validate()) {
      toast({
        title: t("admin.notifications.emailTemplates.toast.validationError"),
        description: t("admin.notifications.emailTemplates.toast.fixErrors"),
        variant: "destructive",
      });
      return;
    }

    if (isEdit) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate(formData);
    }
  };

  const insertVariable = (
    variable: string,
    targetField: "subject" | "htmlBody" | "textBody",
  ) => {
    const variableText = `{{${variable}}}`;

    if (targetField === "subject" && subjectRef.current) {
      const input = subjectRef.current;
      const start = input.selectionStart || 0;
      const end = input.selectionEnd || 0;
      const newValue =
        formData.subject.slice(0, start) +
        variableText +
        formData.subject.slice(end);
      setFormData({ ...formData, subject: newValue });
      setTimeout(() => {
        input.focus();
        input.setSelectionRange(
          start + variableText.length,
          start + variableText.length,
        );
      }, 0);
    } else if (targetField === "htmlBody" && htmlBodyRef.current) {
      const textarea = htmlBodyRef.current;
      const start = textarea.selectionStart || 0;
      const end = textarea.selectionEnd || 0;
      const newValue =
        formData.htmlBody.slice(0, start) +
        variableText +
        formData.htmlBody.slice(end);
      setFormData({ ...formData, htmlBody: newValue });
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(
          start + variableText.length,
          start + variableText.length,
        );
      }, 0);
    } else if (targetField === "textBody" && textBodyRef.current) {
      const textarea = textBodyRef.current;
      const start = textarea.selectionStart || 0;
      const end = textarea.selectionEnd || 0;
      const newValue =
        formData.textBody.slice(0, start) +
        variableText +
        formData.textBody.slice(end);
      setFormData({ ...formData, textBody: newValue });
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(
          start + variableText.length,
          start + variableText.length,
        );
      }, 0);
    }
  };

  const getPreviewHtml = () => {
    let html = formData.htmlBody;
    formData.variables.forEach((variable) => {
      const regex = new RegExp(`\\{\\{${variable}\\}\\}`, "g");
      html = html.replace(
        regex,
        `<span style="background-color: #fef3c7; padding: 0 4px; border-radius: 4px;">[${variable}]</span>`,
      );
    });
    return html;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-md">
              <Mail className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <DialogTitle>
                {isEdit
                  ? t("admin.notifications.emailTemplates.editTitle")
                  : t("admin.notifications.emailTemplates.createTitle")}
              </DialogTitle>
              <DialogDescription>
                {isEdit
                  ? t("admin.notifications.emailTemplates.editDescription")
                  : t("admin.notifications.emailTemplates.createDescription")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="template-type">
                  {t("admin.notifications.emailTemplates.fields.templateType")}
                  <span className="text-destructive ml-1">*</span>
                </Label>
                <Input
                  id="template-type"
                  data-testid="input-template-type"
                  placeholder={t(
                    "admin.notifications.emailTemplates.fields.templateTypePlaceholder",
                  )}
                  value={formData.templateType}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      templateType: e.target.value
                        .toLowerCase()
                        .replace(/\s+/g, "_"),
                    })
                  }
                  disabled={isPending || isEdit}
                  className={errors.templateType ? "border-destructive" : ""}
                />
                {errors.templateType && (
                  <p className="text-xs text-destructive">
                    {errors.templateType}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {t(
                    "admin.notifications.emailTemplates.fields.templateTypeHint",
                  )}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="template-name">
                  {t("admin.notifications.emailTemplates.fields.name")}
                  <span className="text-destructive ml-1">*</span>
                </Label>
                <Input
                  id="template-name"
                  data-testid="input-template-name"
                  placeholder={t(
                    "admin.notifications.emailTemplates.fields.namePlaceholder",
                  )}
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  disabled={isPending}
                  className={errors.name ? "border-destructive" : ""}
                />
                {errors.name && (
                  <p className="text-xs text-destructive">{errors.name}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="template-subject">
                  {t("admin.notifications.emailTemplates.fields.subject")}
                  <span className="text-destructive ml-1">*</span>
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      data-testid="button-insert-variable-subject"
                    >
                      <Variable className="h-3 w-3 mr-1" />
                      {t("admin.notifications.emailTemplates.insertVariable")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80" align="end">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">
                        {t(
                          "admin.notifications.emailTemplates.availableVariables",
                        )}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {formData.variables.map((variable) => (
                          <Badge
                            key={variable}
                            variant="secondary"
                            className="cursor-pointer hover-elevate"
                            onClick={() => insertVariable(variable, "subject")}
                            data-testid={`badge-variable-subject-${variable}`}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            {`{{${variable}}}`}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <Input
                id="template-subject"
                ref={subjectRef}
                data-testid="input-template-subject"
                placeholder={t(
                  "admin.notifications.emailTemplates.fields.subjectPlaceholder",
                )}
                value={formData.subject}
                onChange={(e) =>
                  setFormData({ ...formData, subject: e.target.value })
                }
                disabled={isPending}
                className={`font-mono ${errors.subject ? "border-destructive" : ""}`}
              />
              {errors.subject && (
                <p className="text-xs text-destructive">{errors.subject}</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <Label>
                  {t("admin.notifications.emailTemplates.fields.body")}
                </Label>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        data-testid="button-insert-variable-body"
                      >
                        <Variable className="h-3 w-3 mr-1" />
                        {t("admin.notifications.emailTemplates.insertVariable")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80" align="end">
                      <div className="space-y-2">
                        <p className="text-sm font-medium">
                          {t(
                            "admin.notifications.emailTemplates.availableVariables",
                          )}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {formData.variables.map((variable) => (
                            <Badge
                              key={variable}
                              variant="secondary"
                              className="cursor-pointer hover-elevate"
                              onClick={() =>
                                insertVariable(
                                  variable,
                                  activeTab === "html"
                                    ? "htmlBody"
                                    : "textBody",
                                )
                              }
                              data-testid={`badge-variable-body-${variable}`}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              {`{{${variable}}}`}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => setShowPreview(!showPreview)}
                    data-testid="button-toggle-preview"
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    {showPreview
                      ? t("admin.notifications.emailTemplates.hidePreview")
                      : t("admin.notifications.emailTemplates.showPreview")}
                  </Button>
                </div>
              </div>

              <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as "html" | "text")}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="html" data-testid="tab-html-body">
                    <Code className="h-4 w-4 mr-2" />
                    {t("admin.notifications.emailTemplates.tabs.html")}
                  </TabsTrigger>
                  <TabsTrigger value="text" data-testid="tab-text-body">
                    <FileText className="h-4 w-4 mr-2" />
                    {t("admin.notifications.emailTemplates.tabs.text")}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="html" className="mt-4">
                  {showPreview ? (
                    <div className="border rounded-lg overflow-hidden">
                      <div className="bg-muted px-3 py-2 border-b text-xs font-medium flex items-center gap-2">
                        <Eye className="h-3 w-3" />
                        {t("admin.notifications.emailTemplates.previewLabel")}
                      </div>
                      <ScrollArea className="h-[300px]">
                        <div
                          className="p-4 prose prose-sm prose-invert max-w-none"
                          dangerouslySetInnerHTML={{ __html: getPreviewHtml() }}
                          data-testid="preview-html"
                        />
                      </ScrollArea>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Textarea
                        ref={htmlBodyRef}
                        data-testid="textarea-html-body"
                        placeholder={t(
                          "admin.notifications.emailTemplates.fields.htmlBodyPlaceholder",
                        )}
                        value={formData.htmlBody}
                        onChange={(e) =>
                          setFormData({ ...formData, htmlBody: e.target.value })
                        }
                        disabled={isPending}
                        className={`min-h-[300px] font-mono text-sm ${errors.htmlBody ? "border-destructive" : ""}`}
                      />
                      {errors.htmlBody && (
                        <p className="text-xs text-destructive">
                          {errors.htmlBody}
                        </p>
                      )}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="text" className="mt-4">
                  <div className="space-y-1">
                    <Textarea
                      ref={textBodyRef}
                      data-testid="textarea-text-body"
                      placeholder={t(
                        "admin.notifications.emailTemplates.fields.textBodyPlaceholder",
                      )}
                      value={formData.textBody}
                      onChange={(e) =>
                        setFormData({ ...formData, textBody: e.target.value })
                      }
                      disabled={isPending}
                      className="min-h-[300px] font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "admin.notifications.emailTemplates.fields.textBodyHint",
                      )}
                    </p>
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            <div className="space-y-2">
              <Label>
                {t("admin.notifications.emailTemplates.availableVariables")}
              </Label>
              <div className="flex flex-wrap gap-2 p-3 border rounded-lg bg-muted/30">
                {formData.variables.map((variable) => (
                  <Badge
                    key={variable}
                    variant="outline"
                    className="font-mono text-xs"
                    data-testid={`badge-display-${variable}`}
                  >
                    {`{{${variable}}}`}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("admin.notifications.emailTemplates.variablesHint")}
              </p>
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="space-y-1">
                <Label
                  htmlFor="template-active"
                  className="text-base font-medium"
                >
                  {t("admin.notifications.emailTemplates.fields.isActive")}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t("admin.notifications.emailTemplates.fields.isActiveHint")}
                </p>
              </div>
              <Switch
                id="template-active"
                data-testid="switch-is-active"
                checked={formData.isActive}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, isActive: checked })
                }
                disabled={isPending}
              />
            </div>

            {Object.keys(errors).length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {t("admin.notifications.emailTemplates.toast.fixErrors")}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t flex-shrink-0">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isPending}
            data-testid="button-cancel"
          >
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSave}
            disabled={isPending}
            data-testid="button-save"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t("common.saving")}
              </>
            ) : isEdit ? (
              t("common.saveChanges")
            ) : (
              t("common.create")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getDefaultHtmlTemplate(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Template</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 8px; padding: 32px; margin-bottom: 24px;">
    <h1 style="margin: 0 0 16px 0; color: #1a1a1a;">Hello, {{userName}}!</h1>
    <p style="margin: 0; color: #666;">
      Your email content goes here.
    </p>
  </div>
  
  <p style="color: #999; font-size: 12px; text-align: center;">
    © {{companyName}} - All rights reserved
  </p>
</body>
</html>`;
}

export default EmailTemplateEditor;
