"use strict";

/**
 * Additional Compliance Framework Control Definitions
 *
 * Four extra frameworks: CCPA/CPRA, SOX IT Controls, CIS Controls v8, CSA STAR
 * Follow the same ControlDefinition pattern as the existing ISO 27001, SOC 2, DPDP controls.
 */

import type { ControlDefinition, ComplianceFramework } from "./compliance-report.service";

type ControlDef = Omit<ControlDefinition, "status" | "evidence">;

// ════════════════════════════════════════════════════════════════════════════════
// CCPA/CPRA Controls
// ════════════════════════════════════════════════════════════════════════════════

export function getCcpaControls(): ControlDef[] {
  return [
    // ═══════════════════════════════════════════════════════════════
    // Consumer Rights
    // ═══════════════════════════════════════════════════════════════
    {
      id: "CCPA.1.1",
      framework: "ccpa" as ComplianceFramework,
      title: "Right to Know",
      description:
        "Consumers have the right to know what personal information is being collected about them, the categories of sources, the business purpose for collecting it, and the categories of third parties with whom it is shared.",
      category: "Consumer Rights",
      guidance: {
        learnMore:
          "Under CCPA Section 1798.100, businesses must disclose the categories and specific pieces of personal information collected. Consumers can submit verifiable requests and the business has 45 days to respond. The CPRA expanded this to include the right to know about automated decision-making.",
        whyItMatters:
          "Failure to honor right-to-know requests can result in fines of up to $7,500 per intentional violation. For an AI platform processing personal data through Claws, consumers must understand what data is being fed into AI models and how outputs are used.",
        requiredActions: [
          { action: "Implement a data inventory cataloging all personal information processed by Claws", configPath: "/app/claws", automated: true },
          { action: "Create an API endpoint for consumer data access requests", configPath: "/app/compliance", automated: false },
          { action: "Configure audit logging to track all personal data processing activities", configPath: "/app/compliance", automated: true },
        ],
      },
    },
    {
      id: "CCPA.1.2",
      framework: "ccpa" as ComplianceFramework,
      title: "Right to Delete",
      description:
        "Consumers have the right to request deletion of personal information collected from them, subject to certain exceptions.",
      category: "Consumer Rights",
      guidance: {
        learnMore:
          "Upon receiving a verifiable deletion request, the business must delete personal information from its records and direct service providers to do the same. Exceptions include data needed for completing transactions, detecting security incidents, exercising free speech, or complying with legal obligations.",
        whyItMatters:
          "AI platforms retain personal data across inference logs, training data caches, and audit trails. Without a systematic deletion capability, stale personal data accumulates indefinitely, increasing breach exposure and regulatory risk.",
        requiredActions: [
          { action: "Implement data deletion workflows that cascade across Claw inference logs and audit records", configPath: "/app/compliance", automated: false },
          { action: "Configure data retention policies with automated expiration for personal data", configPath: "/app/compliance", automated: true },
          { action: "Document exemptions where deletion cannot be completed and the legal basis", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CCPA.1.3",
      framework: "ccpa" as ComplianceFramework,
      title: "Right to Opt-Out of Sale/Sharing",
      description:
        "Consumers have the right to opt out of the sale or sharing of their personal information, including for cross-context behavioral advertising.",
      category: "Consumer Rights",
      guidance: {
        learnMore:
          "The CPRA expanded this right to cover 'sharing' personal information for cross-context behavioral advertising. Businesses must provide a 'Do Not Sell or Share My Personal Information' link on their website and honor Global Privacy Control signals.",
        whyItMatters:
          "If AI-processed personal data is shared with third-party model providers or analytics platforms, this constitutes 'sharing' under CPRA. Consumers must be able to opt out of their data flowing through these AI pipelines.",
        requiredActions: [
          { action: "Configure data-sharing consent flags on Claw data processing pipelines", configPath: "/app/claw-policies", automated: true },
          { action: "Implement Global Privacy Control (GPC) signal detection and honoring", configPath: "/app/compliance", automated: false },
          { action: "Maintain a registry of third-party AI model providers receiving personal data", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CCPA.1.4",
      framework: "ccpa" as ComplianceFramework,
      title: "Right to Non-Discrimination",
      description:
        "Businesses cannot discriminate against consumers for exercising their CCPA rights by denying goods or services, charging different prices, or providing a different level of quality.",
      category: "Consumer Rights",
      guidance: {
        learnMore:
          "This right ensures consumers who exercise privacy rights receive equal service. Businesses may offer financial incentives for data collection but must clearly disclose the material terms and obtain opt-in consent.",
        whyItMatters:
          "AI-powered services must not degrade in quality when a consumer opts out of data collection. Claws that rely on personal data for personalization must gracefully fall back to non-personalized behavior without penalty.",
        requiredActions: [
          { action: "Verify Claw service quality is maintained when consumer data is restricted", configPath: "/app/claws", automated: true },
          { action: "Document non-discrimination policies for consumers exercising privacy rights", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CCPA.1.5",
      framework: "ccpa" as ComplianceFramework,
      title: "Right to Correct Inaccurate Personal Information",
      description:
        "Consumers have the right to request correction of inaccurate personal information maintained by a business (added by CPRA).",
      category: "Consumer Rights",
      guidance: {
        learnMore:
          "Under CPRA Section 1798.106, consumers can direct businesses to correct inaccurate personal information. The business must use commercially reasonable efforts to correct the information as directed and instruct service providers to do the same.",
        whyItMatters:
          "Inaccurate personal data fed into AI models produces biased or incorrect outputs. If a Claw uses stale or wrong personal data for decision-making, it could result in discriminatory outcomes and legal liability.",
        requiredActions: [
          { action: "Implement data correction workflows accessible to consumers", configPath: "/app/compliance", automated: false },
          { action: "Configure Claw data pipelines to propagate corrections to all downstream systems", configPath: "/app/claws", automated: true },
          { action: "Log all correction requests and outcomes in the audit trail", configPath: "/app/compliance", automated: true },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // Business Obligations
    // ═══════════════════════════════════════════════════════════════
    {
      id: "CCPA.2.1",
      framework: "ccpa" as ComplianceFramework,
      title: "Notice at Collection",
      description:
        "Businesses must inform consumers at or before the point of collection about the categories of personal information to be collected and the purposes for which it will be used.",
      category: "Business Obligations",
      guidance: {
        learnMore:
          "The notice must specify categories of personal information collected, the purposes for collection, whether it will be sold or shared, and the retention period. Under CPRA, notice must also include retention periods for each category.",
        whyItMatters:
          "When consumers interact with AI-powered services (voice Claws, chat Claws), their data is collected in real-time. Without proper notice before these interactions, every data collection becomes a CCPA violation.",
        requiredActions: [
          { action: "Configure pre-interaction privacy notices for all consumer-facing Claws", configPath: "/app/claws", automated: true },
          { action: "Document the categories of personal information collected by each Claw type", configPath: "/app/compliance", automated: false },
          { action: "Set retention periods for each category of collected personal information", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CCPA.2.2",
      framework: "ccpa" as ComplianceFramework,
      title: "Service Provider Contracts",
      description:
        "Businesses must have written contracts with service providers and contractors that restrict the processing of personal information to specified purposes.",
      category: "Business Obligations",
      guidance: {
        learnMore:
          "Contracts with service providers must prohibit selling or sharing the personal information, retaining or using it outside the business relationship, and combining it with other data. The CPRA requires that contracts also include the right to audit and remediate.",
        whyItMatters:
          "AI model providers (OpenAI, Anthropic, etc.) are service providers processing personal data. Without proper contractual restrictions, these providers could retain or reuse consumer personal data for training, creating massive compliance exposure.",
        requiredActions: [
          { action: "Review contracts with all AI model providers for CCPA-compliant data processing clauses", configPath: "/app/compliance", automated: false },
          { action: "Document service provider agreements and their compliance status", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CCPA.2.3",
      framework: "ccpa" as ComplianceFramework,
      title: "Reasonable Security Measures",
      description:
        "Businesses must implement and maintain reasonable security procedures and practices appropriate to the nature of the personal information.",
      category: "Business Obligations",
      guidance: {
        learnMore:
          "While CCPA does not prescribe specific security measures, the private right of action for data breaches applies when a business fails to implement reasonable security. This is typically measured against industry standards like CIS Controls or NIST CSF.",
        whyItMatters:
          "Data breaches involving unencrypted or unredacted personal information trigger statutory damages of $100-$750 per consumer per incident. For an AI platform processing millions of records, a single breach can result in catastrophic financial liability.",
        requiredActions: [
          { action: "Verify encryption at rest and in transit for all personal data processed by Claws", configPath: "/app/compliance", automated: true },
          { action: "Configure OPA policies enforcing data access controls for personal information", configPath: "/app/claw-policies", automated: true },
          { action: "Enable comprehensive audit logging for all personal data access", configPath: "/app/compliance", automated: true },
        ],
      },
    },
    {
      id: "CCPA.2.4",
      framework: "ccpa" as ComplianceFramework,
      title: "Privacy Policy Requirements",
      description:
        "Businesses must maintain a comprehensive privacy policy that is updated at least once every 12 months and discloses all required information.",
      category: "Business Obligations",
      guidance: {
        learnMore:
          "The privacy policy must list the categories of personal information collected in the preceding 12 months, the categories of sources, the business purposes, the categories of third parties shared with, and the specific pieces of personal information collected.",
        whyItMatters:
          "An outdated or incomplete privacy policy is the most commonly cited CCPA violation. Regulators check privacy policies first during investigations, and deficiencies can escalate a routine inquiry into an enforcement action.",
        requiredActions: [
          { action: "Document a CCPA-compliant privacy policy covering AI data processing", configPath: "/app/compliance", automated: false },
          { action: "Schedule annual privacy policy review and update reminders", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // Data Practices
    // ═══════════════════════════════════════════════════════════════
    {
      id: "CCPA.3.1",
      framework: "ccpa" as ComplianceFramework,
      title: "Data Minimization",
      description:
        "A business's collection, use, retention, and sharing of a consumer's personal information shall be reasonably necessary and proportionate to achieve the purposes for which it was collected (CPRA addition).",
      category: "Data Practices",
      guidance: {
        learnMore:
          "Under CPRA, businesses must limit personal information collection to what is reasonably necessary for the disclosed purpose. This principle applies to the entire data lifecycle, including how much personal data is fed into AI models.",
        whyItMatters:
          "AI systems tend to be data-hungry — feeding maximum data into models for better results. But processing more personal data than necessary violates data minimization and exponentially increases breach impact and regulatory exposure.",
        requiredActions: [
          { action: "Review Claw configurations to ensure only necessary personal data fields are processed", configPath: "/app/claws", automated: true },
          { action: "Configure OPA policies to enforce data minimization rules on Claw inputs", configPath: "/app/claw-policies", automated: true },
          { action: "Document data minimization assessments for each Claw use case", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CCPA.3.2",
      framework: "ccpa" as ComplianceFramework,
      title: "Purpose Limitation",
      description:
        "Personal information collected for a stated purpose shall not be further processed in a manner incompatible with that purpose without additional notice and consent.",
      category: "Data Practices",
      guidance: {
        learnMore:
          "Once personal data is collected for a specific purpose (e.g., customer service via a voice Claw), it cannot be repurposed for other uses (e.g., training a different AI model) without informing the consumer and obtaining fresh consent.",
        whyItMatters:
          "AI platforms are tempted to reuse personal data across different Claws and use cases. Purpose creep is a common regulatory trigger — using customer service call data for marketing predictions without consent is a clear CCPA violation.",
        requiredActions: [
          { action: "Tag all Claws with their declared data processing purpose", configPath: "/app/claws", automated: true },
          { action: "Configure access policies preventing cross-purpose data usage between Claws", configPath: "/app/claw-policies", automated: true },
          { action: "Implement purpose-binding checks in data processing pipelines", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CCPA.3.3",
      framework: "ccpa" as ComplianceFramework,
      title: "Sensitive Personal Information Restrictions",
      description:
        "Consumers have the right to limit the use and disclosure of sensitive personal information to purposes necessary to perform the services or provide the goods reasonably expected.",
      category: "Data Practices",
      guidance: {
        learnMore:
          "Sensitive PI includes SSN, driver's license, financial account numbers, geolocation, racial/ethnic origin, religious beliefs, genetic data, biometric information, health data, and sex life/orientation. A 'Limit the Use of My Sensitive Personal Information' link must be provided.",
        whyItMatters:
          "AI Claws processing sensitive personal information (e.g., health data in a medical support Claw, financial data in a banking Claw) face the strictest CCPA requirements. Mishandling triggers maximum penalties and reputational damage.",
        requiredActions: [
          { action: "Identify and tag Claws processing sensitive personal information", configPath: "/app/claws", automated: true },
          { action: "Configure enhanced OPA policies for Claws handling sensitive PI", configPath: "/app/claw-policies", automated: true },
          { action: "Implement consumer opt-out mechanism for sensitive PI processing", configPath: "/app/compliance", automated: false },
        ],
      },
    },
  ];
}

// ════════════════════════════════════════════════════════════════════════════════
// SOX IT Controls
// ════════════════════════════════════════════════════════════════════════════════

export function getSoxControls(): ControlDef[] {
  return [
    // ═══════════════════════════════════════════════════════════════
    // IT General Controls
    // ═══════════════════════════════════════════════════════════════
    {
      id: "SOX.ITGC.1",
      framework: "sox" as ComplianceFramework,
      title: "Access Management",
      description:
        "Logical access to programs and data shall be restricted to authorized individuals through user provisioning, authentication, and periodic access reviews.",
      category: "IT General Controls",
      guidance: {
        learnMore:
          "SOX ITGC access management requires that only authorized users can access financial systems and data. This includes formal provisioning processes, unique user IDs, strong authentication, and periodic recertification of access rights by management.",
        whyItMatters:
          "If unauthorized users can access or modify financial data processed by Claws (e.g., revenue recognition models, financial reporting agents), the integrity of financial statements is compromised. Auditors will issue material weakness findings.",
        requiredActions: [
          { action: "Configure RBAC roles restricting access to financial data processing Claws", configPath: "/app/roles", automated: true },
          { action: "Implement formal user provisioning workflows with management approval", configPath: "/app/roles", automated: true },
          { action: "Schedule quarterly access recertification reviews", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "SOX.ITGC.2",
      framework: "sox" as ComplianceFramework,
      title: "Change Management",
      description:
        "Changes to IT systems, programs, and configurations shall be authorized, tested, and approved before implementation in production.",
      category: "IT General Controls",
      guidance: {
        learnMore:
          "All changes to systems affecting financial data integrity must follow a documented change management process: request, impact assessment, development, testing, approval, and deployment. Emergency changes require post-implementation review.",
        whyItMatters:
          "Uncontrolled changes to Claw configurations, OPA policies, or data processing pipelines could alter how financial data is processed, leading to misstatements in financial reports. Auditors require evidence of controlled change processes.",
        requiredActions: [
          { action: "Enable audit logging for all Claw configuration and policy changes", configPath: "/app/compliance", automated: true },
          { action: "Configure OPA policies requiring approval for production Claw changes", configPath: "/app/claw-policies", automated: true },
          { action: "Document change management procedures for financially-relevant system modifications", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "SOX.ITGC.3",
      framework: "sox" as ComplianceFramework,
      title: "Computer Operations",
      description:
        "IT operations including job scheduling, backup and recovery, and incident management shall be controlled to ensure system availability and data integrity.",
      category: "IT General Controls",
      guidance: {
        learnMore:
          "SOX requires that IT operations supporting financial processes are reliable and recoverable. This includes automated job monitoring, backup verification, capacity management, and incident tracking with resolution documentation.",
        whyItMatters:
          "If Claw-based financial processing (automated reconciliation, invoice processing, revenue analysis) experiences undetected failures or data loss, financial statements may contain errors that go unreported.",
        requiredActions: [
          { action: "Configure concurrency session monitoring for financial processing Claws", configPath: "/app/compliance", automated: true },
          { action: "Implement automated backup verification for databases containing financial data", configPath: "/app/compliance", automated: false },
          { action: "Document incident management procedures for financial system outages", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "SOX.ITGC.4",
      framework: "sox" as ComplianceFramework,
      title: "Program Development",
      description:
        "New programs and modifications to existing programs shall follow a software development lifecycle (SDLC) with appropriate controls for authorization, testing, and deployment.",
      category: "IT General Controls",
      guidance: {
        learnMore:
          "Development of new Claws or modifications to existing ones that process financial data must follow a controlled SDLC: requirements documentation, design review, development, QA testing, user acceptance testing, and authorized deployment.",
        whyItMatters:
          "A Claw deployed without proper testing could miscalculate financial amounts, misclassify transactions, or produce incorrect reports. Auditors require evidence that all financially-relevant system changes were properly tested before deployment.",
        requiredActions: [
          { action: "Enforce policy template assignment before activating Claws that process financial data", configPath: "/app/claw-policies", automated: true },
          { action: "Document SDLC procedures for Claw development and configuration", configPath: "/app/compliance", automated: false },
          { action: "Require separate development and production environments for financial Claws", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "SOX.ITGC.5",
      framework: "sox" as ComplianceFramework,
      title: "Logical Security",
      description:
        "IT systems shall implement logical security controls including network segmentation, encryption, intrusion detection, and vulnerability management.",
      category: "IT General Controls",
      guidance: {
        learnMore:
          "Logical security encompasses all non-physical security controls: firewalls, encryption, network segmentation, anti-malware, patch management, and security monitoring. These controls protect the infrastructure supporting financial applications.",
        whyItMatters:
          "A compromised platform infrastructure allows attackers to manipulate financial data processed by Claws, exfiltrate sensitive financial information, or alter AI model outputs used in financial reporting.",
        requiredActions: [
          { action: "Verify TLS encryption is enabled for all Claw communications", configPath: "/app/compliance", automated: true },
          { action: "Configure OPA network policies restricting Claw external communications", configPath: "/app/claw-policies", automated: true },
          { action: "Document network security architecture and segmentation for financial systems", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // Application Controls
    // ═══════════════════════════════════════════════════════════════
    {
      id: "SOX.AC.1",
      framework: "sox" as ComplianceFramework,
      title: "Input Controls",
      description:
        "Controls shall be implemented to ensure that data entered into financial systems is authorized, complete, accurate, and processed only once.",
      category: "Application Controls",
      guidance: {
        learnMore:
          "Input controls validate data at the point of entry: authorization checks, format validation, range checks, reasonableness tests, and duplicate detection. For AI-processed financial data, this includes validating Claw inputs before processing.",
        whyItMatters:
          "Garbage in, garbage out applies doubly to AI systems. If a financial processing Claw receives invalid or duplicate input data, it will produce incorrect outputs that flow directly into financial reports without human review.",
        requiredActions: [
          { action: "Configure input validation rules on Claws processing financial data", configPath: "/app/claw-policies", automated: true },
          { action: "Enable duplicate detection for financial transaction processing", configPath: "/app/compliance", automated: false },
          { action: "Log all financial data inputs with source attribution for audit trail", configPath: "/app/compliance", automated: true },
        ],
      },
    },
    {
      id: "SOX.AC.2",
      framework: "sox" as ComplianceFramework,
      title: "Processing Controls",
      description:
        "Controls shall be implemented to ensure that data is processed completely and accurately, and that processing errors are detected and corrected.",
      category: "Application Controls",
      guidance: {
        learnMore:
          "Processing controls ensure computational accuracy: batch totals, run-to-run balancing, exception reporting, and error handling. For AI-processed data, this includes monitoring model outputs for anomalies and validating against expected ranges.",
        whyItMatters:
          "AI model hallucinations in financial processing can produce plausible but incorrect numbers. Without processing controls, a Claw could generate financial summaries with fabricated figures that pass cursory human review.",
        requiredActions: [
          { action: "Configure output validation rules for financial processing Claws", configPath: "/app/claw-policies", automated: true },
          { action: "Implement anomaly detection for Claw financial output values", configPath: "/app/compliance", automated: false },
          { action: "Enable comprehensive processing audit logs with input-output correlation", configPath: "/app/compliance", automated: true },
        ],
      },
    },
    {
      id: "SOX.AC.3",
      framework: "sox" as ComplianceFramework,
      title: "Output Controls",
      description:
        "Controls shall be implemented to ensure that processing results are complete, accurate, and distributed only to authorized recipients.",
      category: "Application Controls",
      guidance: {
        learnMore:
          "Output controls verify that reports and data produced by financial systems are complete, accurate, and securely distributed. This includes reconciliation of output totals, restricted distribution of sensitive financial reports, and retention of output records.",
        whyItMatters:
          "Financial reports generated by Claws may be distributed to executives, board members, auditors, and regulators. If outputs are inaccurate or reach unauthorized recipients, it creates material misstatement risk and potential securities violations.",
        requiredActions: [
          { action: "Configure access controls restricting who can view Claw-generated financial reports", configPath: "/app/roles", automated: true },
          { action: "Implement output reconciliation checks for financial report generation", configPath: "/app/compliance", automated: false },
          { action: "Enable audit logging for all financial report access and distribution", configPath: "/app/compliance", automated: true },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // Financial Reporting
    // ═══════════════════════════════════════════════════════════════
    {
      id: "SOX.FR.1",
      framework: "sox" as ComplianceFramework,
      title: "Internal Controls Assessment",
      description:
        "Management must assess the effectiveness of internal controls over financial reporting on an annual basis and document the assessment methodology, scope, and results.",
      category: "Financial Reporting",
      guidance: {
        learnMore:
          "SOX Section 404 requires management to establish and maintain an adequate internal control structure and assess its effectiveness annually. This includes identifying material financial processes, documenting control activities, testing controls, and remediating deficiencies.",
        whyItMatters:
          "For AI-assisted financial processes, the assessment must specifically address risks introduced by AI decision-making: model accuracy, data quality, output validation, and the potential for AI-generated errors in financial reporting.",
        requiredActions: [
          { action: "Generate compliance reports covering all frameworks for internal controls assessment", configPath: "/app/compliance", automated: true },
          { action: "Document the scope and methodology of the annual internal controls assessment", configPath: "/app/compliance", automated: false },
          { action: "Verify all control implementations using the live verification feature", configPath: "/app/compliance", automated: true },
        ],
      },
    },
    {
      id: "SOX.FR.2",
      framework: "sox" as ComplianceFramework,
      title: "Management Certification",
      description:
        "CEO and CFO must certify the accuracy of financial reports and the effectiveness of internal controls, taking personal responsibility for any misstatements.",
      category: "Financial Reporting",
      guidance: {
        learnMore:
          "SOX Sections 302 and 906 require the CEO and CFO to personally certify quarterly and annual financial reports. They must confirm that they have reviewed the report, it contains no material misstatements, and internal controls are effective.",
        whyItMatters:
          "When AI Claws contribute to financial reporting, management must understand and accept the risks of AI-assisted processes. A CEO certifying reports generated partly by AI without understanding the AI controls exposes themselves to criminal liability.",
        requiredActions: [
          { action: "Assign executive Owner roles in RBAC for financial reporting oversight", configPath: "/app/roles", automated: true },
          { action: "Generate a management-ready compliance summary report before certification", configPath: "/app/compliance", automated: true },
          { action: "Document the AI components involved in financial reporting processes", configPath: "/app/compliance", automated: false },
        ],
      },
    },
  ];
}

// ════════════════════════════════════════════════════════════════════════════════
// CIS Controls v8
// ════════════════════════════════════════════════════════════════════════════════

export function getCisControls(): ControlDef[] {
  return [
    // ═══════════════════════════════════════════════════════════════
    // IG1 — Basic Hygiene
    // ═══════════════════════════════════════════════════════════════
    {
      id: "CIS.1.1",
      framework: "cis" as ComplianceFramework,
      title: "Inventory of Enterprise Assets",
      description:
        "Actively manage (inventory, track, and correct) all enterprise assets connected to the infrastructure, to accurately know the totality of assets that need to be monitored and protected.",
      category: "IG1 Basic Hygiene",
      guidance: {
        learnMore:
          "CIS Control 1 requires maintaining a complete inventory of all hardware assets (physical and virtual, cloud and on-premises). For a SaaS AI platform, this includes all server instances, containers, Claw runtime environments, and edge nodes.",
        whyItMatters:
          "Untracked assets cannot be patched, monitored, or protected. Shadow Claw instances or forgotten development environments become easy targets for attackers seeking access to AI models and data.",
        requiredActions: [
          { action: "Catalog all Claw runtime instances and their deployment status", configPath: "/app/claws", automated: true },
          { action: "Review active concurrency sessions to identify all running resources", configPath: "/app/compliance", automated: true },
          { action: "Document all infrastructure components in the asset inventory", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CIS.2.1",
      framework: "cis" as ComplianceFramework,
      title: "Inventory of Software Assets",
      description:
        "Actively manage (inventory, track, and correct) all software on the network so that only authorized software is installed and can execute, and unauthorized software is found and prevented from installation or execution.",
      category: "IG1 Basic Hygiene",
      guidance: {
        learnMore:
          "CIS Control 2 requires maintaining an inventory of all authorized software, including applications, libraries, AI models, MCP tools, and Claw skills. Unauthorized software must be detected and blocked.",
        whyItMatters:
          "Unauthorized MCP tools or Claw skills can introduce vulnerabilities, exfiltrate data, or provide backdoor access. Without a software inventory, malicious tools can operate undetected within the AI platform.",
        requiredActions: [
          { action: "Review all MCP tool integrations and Claw skills for authorization", configPath: "/app/claw-policies", automated: true },
          { action: "Configure OPA policies to enforce allowed software and skill lists", configPath: "/app/claw-policies", automated: true },
          { action: "Maintain a software bill of materials (SBOM) for the platform", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CIS.3.1",
      framework: "cis" as ComplianceFramework,
      title: "Data Protection",
      description:
        "Develop processes and technical controls to identify, classify, securely handle, retain, and dispose of data.",
      category: "IG1 Basic Hygiene",
      guidance: {
        learnMore:
          "CIS Control 3 covers the full data lifecycle: identification, classification, handling, retention, and disposal. For an AI platform, this includes data flowing through Claws, inference logs, model training data, and cached results.",
        whyItMatters:
          "AI platforms process data from many sources with varying sensitivity levels. Without systematic data protection, sensitive data can leak through model outputs, debug logs, or cached inference results.",
        requiredActions: [
          { action: "Assign data classification levels to all Claws and data sources", configPath: "/app/claws", automated: true },
          { action: "Configure OPA policies enforcing classification-based access controls", configPath: "/app/claw-policies", automated: true },
          { action: "Implement data retention and disposal policies for AI-processed data", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CIS.4.1",
      framework: "cis" as ComplianceFramework,
      title: "Secure Configuration of Enterprise Assets",
      description:
        "Establish and maintain the secure configuration of enterprise assets using hardened baseline configurations.",
      category: "IG1 Basic Hygiene",
      guidance: {
        learnMore:
          "CIS Control 4 requires applying secure configuration baselines to all enterprise assets. For the AI platform, this means hardened configurations for Claw runtime environments, OPA engines, databases, and API gateways.",
        whyItMatters:
          "Default configurations are designed for ease of use, not security. An unhardened Claw runtime might expose debug endpoints, allow unrestricted network access, or run with excessive privileges.",
        requiredActions: [
          { action: "Apply security-hardened OPA policy templates to all Claws", configPath: "/app/claw-policies", automated: true },
          { action: "Verify OPA engine is configured with secure defaults", configPath: "/app/compliance", automated: true },
          { action: "Document secure configuration baselines for all platform components", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CIS.4.2",
      framework: "cis" as ComplianceFramework,
      title: "Secure Configuration of Software Assets",
      description:
        "Establish and maintain the secure configuration of all software assets, including operating systems, applications, and network devices.",
      category: "IG1 Basic Hygiene",
      guidance: {
        learnMore:
          "Software must run with least-privilege configurations, unnecessary services disabled, and security features enabled. For Claws, this means restricting model capabilities, limiting tool access, and enforcing output constraints.",
        whyItMatters:
          "A Claw configured with unrestricted tool access and no output filtering can be weaponized through prompt injection to execute arbitrary actions or exfiltrate data across the entire platform.",
        requiredActions: [
          { action: "Configure Claw policy templates with restrictive defaults for tool access", configPath: "/app/claw-policies", automated: true },
          { action: "Enable skill approval requirements for all Claws", configPath: "/app/claw-policies", automated: true },
          { action: "Review and restrict default Claw configurations", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CIS.5.1",
      framework: "cis" as ComplianceFramework,
      title: "Account Management",
      description:
        "Use processes and tools to assign and manage authorization to credentials for user accounts, including administrator accounts, as well as service accounts.",
      category: "IG1 Basic Hygiene",
      guidance: {
        learnMore:
          "CIS Control 5 requires managing all account types: user, administrator, service, and system accounts. This includes creating, modifying, disabling, and deleting accounts, plus managing credentials and enforcing strong authentication.",
        whyItMatters:
          "Service accounts and API keys used by Claws to access AI model providers often have broad permissions and rarely expire. Compromised service credentials provide persistent, undetected access to the AI platform.",
        requiredActions: [
          { action: "Review all RBAC user accounts and disable inactive ones", configPath: "/app/roles", automated: true },
          { action: "Implement strong authentication requirements for all account types", configPath: "/app/roles", automated: true },
          { action: "Schedule regular credential rotation for service accounts and API keys", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // IG2 — Foundational
    // ═══════════════════════════════════════════════════════════════
    {
      id: "CIS.6.1",
      framework: "cis" as ComplianceFramework,
      title: "Access Control Management",
      description:
        "Use processes and tools to create, assign, manage, and revoke access credentials and privileges for user, administrator, and service accounts.",
      category: "IG2 Foundational",
      guidance: {
        learnMore:
          "CIS Control 6 focuses on granular access control: role-based access, least-privilege principles, separation of duties, and regular access reviews. Access must be granted based on job function and revoked immediately when no longer needed.",
        whyItMatters:
          "In an AI platform, excessive access means a single compromised account can read all customer data, modify all Claw behaviors, and disable security policies. Granular access control limits blast radius.",
        requiredActions: [
          { action: "Implement granular RBAC permissions aligned with job functions", configPath: "/app/roles", automated: true },
          { action: "Configure OPA policies enforcing least-privilege for Claw access", configPath: "/app/claw-policies", automated: true },
          { action: "Conduct regular access reviews and remove unnecessary privileges", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CIS.7.1",
      framework: "cis" as ComplianceFramework,
      title: "Continuous Vulnerability Management",
      description:
        "Continuously acquire, assess, and take action on information regarding new vulnerabilities to identify and remediate vulnerabilities before they are exploited.",
      category: "IG2 Foundational",
      guidance: {
        learnMore:
          "CIS Control 7 requires regular vulnerability scanning, assessment, and remediation. For an AI platform, this includes monitoring for vulnerabilities in AI models (adversarial attacks), libraries, APIs, and infrastructure components.",
        whyItMatters:
          "AI platforms face unique vulnerabilities: prompt injection, model poisoning, embedding attacks, and supply chain compromises in ML libraries. Traditional vulnerability scanning misses these AI-specific attack vectors.",
        requiredActions: [
          { action: "Configure OPA policies to detect and block known prompt injection patterns", configPath: "/app/claw-policies", automated: true },
          { action: "Enable monitoring for anomalous Claw behavior indicating exploitation", configPath: "/app/compliance", automated: true },
          { action: "Subscribe to security advisories for all AI model providers and libraries", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CIS.8.1",
      framework: "cis" as ComplianceFramework,
      title: "Audit Log Management",
      description:
        "Collect, alert, review, and retain audit logs of events that could help detect, understand, or recover from an attack.",
      category: "IG2 Foundational",
      guidance: {
        learnMore:
          "CIS Control 8 requires comprehensive audit logging with centralized collection, real-time alerting, regular review, and secure retention. Logs must include who did what, when, from where, and the outcome.",
        whyItMatters:
          "Without comprehensive audit logs, attacks go undetected, incident investigations are impossible, and compliance evidence is unavailable. AI platform audit logs are critical for detecting unauthorized data access and model manipulation.",
        requiredActions: [
          { action: "Verify all audit event types are being captured (RBAC, Claw, inference, tool, query)", configPath: "/app/compliance", automated: true },
          { action: "Configure log retention policies meeting regulatory requirements", configPath: "/app/compliance", automated: true },
          { action: "Implement real-time alerting for high-severity audit events", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CIS.9.1",
      framework: "cis" as ComplianceFramework,
      title: "Email and Web Browser Protections",
      description:
        "Improve protections and detections of threats from email and web vectors, as these are some of the most prevalent ways attackers manipulate human behavior.",
      category: "IG2 Foundational",
      guidance: {
        learnMore:
          "CIS Control 9 covers protections against web and email-based threats. For a SaaS AI platform, this includes securing the web application against XSS, CSRF, and injection attacks, and protecting API endpoints from automated abuse.",
        whyItMatters:
          "The AI platform's web interface is the primary attack surface. XSS attacks could inject malicious prompts into Claws, CSRF could trigger unauthorized Claw operations, and API abuse could exhaust AI model credits.",
        requiredActions: [
          { action: "Configure Content Security Policy headers for the platform web interface", configPath: "/app/compliance", automated: false },
          { action: "Enable rate limiting on AI model API endpoints", configPath: "/app/claw-policies", automated: true },
          { action: "Implement input sanitization for all user-facing Claw interaction endpoints", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CIS.10.1",
      framework: "cis" as ComplianceFramework,
      title: "Malware Defenses",
      description:
        "Prevent or control the installation, spread, and execution of malicious applications, code, or scripts on enterprise assets.",
      category: "IG2 Foundational",
      guidance: {
        learnMore:
          "CIS Control 10 requires defenses against malware including prevention, detection, and response. For AI platforms, this extends to detecting malicious MCP tools, compromised Claw skills, and adversarial model inputs.",
        whyItMatters:
          "Traditional malware defenses do not cover AI-specific threats: malicious MCP tools that exfiltrate data, poisoned Claw skills that inject backdoors, or adversarial inputs that cause models to produce harmful outputs.",
        requiredActions: [
          { action: "Configure OPA policies to enforce MCP tool approval and allowlisting", configPath: "/app/claw-policies", automated: true },
          { action: "Enable Claw skill security scoring and minimum score requirements", configPath: "/app/claw-policies", automated: true },
          { action: "Document malware defense strategy covering AI-specific threat vectors", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CIS.11.1",
      framework: "cis" as ComplianceFramework,
      title: "Data Recovery",
      description:
        "Establish and maintain data recovery practices sufficient to restore in-scope enterprise assets to a pre-incident and trusted state.",
      category: "IG2 Foundational",
      guidance: {
        learnMore:
          "CIS Control 11 requires tested data backup and recovery capabilities. For the AI platform, this includes database backups, Claw configurations, OPA policies, RBAC configurations, and audit log archives.",
        whyItMatters:
          "A ransomware attack or catastrophic failure without backups means permanent loss of Claw configurations, customer data, OPA policies, and audit evidence. Recovery without backups is often impossible.",
        requiredActions: [
          { action: "Verify database backup configurations are active and tested", configPath: "/app/compliance", automated: true },
          { action: "Document recovery procedures for all platform components", configPath: "/app/compliance", automated: false },
          { action: "Schedule periodic backup restoration tests", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // IG3 — Organizational
    // ═══════════════════════════════════════════════════════════════
    {
      id: "CIS.12.1",
      framework: "cis" as ComplianceFramework,
      title: "Network Infrastructure Management",
      description:
        "Establish and maintain network infrastructure management processes and tools to identify, classify, secure, and manage network devices and infrastructure.",
      category: "IG2 Foundational",
      guidance: {
        learnMore:
          "CIS Control 12 covers network device management, secure configuration, monitoring, and segmentation. For the AI platform, this includes API gateways, load balancers, container networking, and inter-service communication paths.",
        whyItMatters:
          "Misconfigured network infrastructure can expose internal AI services, allow lateral movement between Claw instances, or enable data exfiltration through unrestricted outbound connections.",
        requiredActions: [
          { action: "Configure network policies restricting Claw outbound communications", configPath: "/app/claw-policies", automated: true },
          { action: "Verify network segmentation between Claw instances and management plane", configPath: "/app/compliance", automated: true },
          { action: "Document network architecture and security controls", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CIS.14.1",
      framework: "cis" as ComplianceFramework,
      title: "Security Awareness Training",
      description:
        "Establish and maintain a security awareness program to influence behavior among the workforce to be security conscious and properly skilled to reduce cybersecurity risks.",
      category: "IG3 Organizational",
      guidance: {
        learnMore:
          "CIS Control 14 requires security awareness training covering organizational policies, secure behavior, and threat recognition. For an AI platform, training must include AI-specific topics like prompt injection awareness, data handling, and responsible AI use.",
        whyItMatters:
          "Users who do not understand AI-specific security risks will inadvertently feed sensitive data into Claws, fall for prompt injection attacks, or misconfigure security policies — even with technical controls in place.",
        requiredActions: [
          { action: "Document security awareness training program covering AI-specific topics", configPath: "/app/compliance", automated: false },
          { action: "Track training completion for all platform users", configPath: "/app/compliance", automated: false },
          { action: "Include prompt injection recognition exercises in training materials", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CIS.15.1",
      framework: "cis" as ComplianceFramework,
      title: "Service Provider Management",
      description:
        "Develop a process to evaluate service providers who hold sensitive data, or are responsible for an enterprise's critical IT platforms or processes, to ensure these providers are protecting those platforms and data appropriately.",
      category: "IG3 Organizational",
      guidance: {
        learnMore:
          "CIS Control 15 requires assessing third-party service providers, establishing security requirements in contracts, and monitoring compliance. This includes AI model providers, cloud infrastructure, telephony services, and any third-party integrations.",
        whyItMatters:
          "AI model providers process your customers' data through their infrastructure. A security failure at OpenAI, Anthropic, or any other provider directly exposes your platform's data. Contracts must mandate security standards and breach notification.",
        requiredActions: [
          { action: "Maintain an inventory of all third-party service providers with security assessments", configPath: "/app/compliance", automated: false },
          { action: "Document security requirements in AI model provider agreements", configPath: "/app/compliance", automated: false },
          { action: "Configure OPA policies restricting which AI providers Claws can use", configPath: "/app/claw-policies", automated: true },
        ],
      },
    },
    {
      id: "CIS.16.1",
      framework: "cis" as ComplianceFramework,
      title: "Application Software Security",
      description:
        "Manage the security lifecycle of in-house developed, hosted, or acquired software to prevent, detect, and remediate security weaknesses before they can impact the enterprise.",
      category: "IG3 Organizational",
      guidance: {
        learnMore:
          "CIS Control 16 covers secure software development practices: security requirements, secure coding, code review, dependency management, security testing, and vulnerability remediation. This applies to the AI platform itself and custom Claw implementations.",
        whyItMatters:
          "The AI platform is the crown jewel — a vulnerability in the platform code could compromise all organizations, all Claws, and all data. Secure development practices are the foundation of everything else in this framework.",
        requiredActions: [
          { action: "Enforce code review and security testing for all platform changes", configPath: "/app/compliance", automated: false },
          { action: "Implement dependency scanning for known vulnerabilities", configPath: "/app/compliance", automated: false },
          { action: "Configure automated security testing in the CI/CD pipeline", configPath: "/app/compliance", automated: false },
        ],
      },
    },
  ];
}

// ════════════════════════════════════════════════════════════════════════════════
// CSA STAR Controls
// ════════════════════════════════════════════════════════════════════════════════

export function getCsaStarControls(): ControlDef[] {
  return [
    // ═══════════════════════════════════════════════════════════════
    // Governance
    // ═══════════════════════════════════════════════════════════════
    {
      id: "CSA.GOV.1",
      framework: "csa_star" as ComplianceFramework,
      title: "Information Security Program",
      description:
        "Establish, document, approve, communicate, apply, evaluate, and maintain an information security program that includes administrative, technical, and physical safeguards.",
      category: "Governance",
      guidance: {
        learnMore:
          "CSA CCM GRC-01 requires a comprehensive information security program covering governance, risk management, compliance, and operational controls. The program must be approved by management and communicated to all relevant parties.",
        whyItMatters:
          "Cloud services like an AI SaaS platform require a robust security program to gain customer trust. CSA STAR certification demonstrates that your security program meets industry-recognized cloud security standards.",
        requiredActions: [
          { action: "Document the information security program covering all platform components", configPath: "/app/compliance", automated: false },
          { action: "Configure OPA policy templates as technical safeguards", configPath: "/app/claw-policies", automated: true },
          { action: "Assign security program ownership through RBAC roles", configPath: "/app/roles", automated: true },
        ],
      },
    },
    {
      id: "CSA.GOV.2",
      framework: "csa_star" as ComplianceFramework,
      title: "Risk Management Program",
      description:
        "Implement and maintain a risk management framework that identifies, assesses, owns, treats, and monitors information security risks aligned with the organization's risk appetite.",
      category: "Governance",
      guidance: {
        learnMore:
          "CSA CCM GRC-02 requires a formal risk management process including risk identification, assessment, treatment, acceptance, and monitoring. Risk assessments must be conducted regularly and whenever significant changes occur.",
        whyItMatters:
          "AI platforms introduce novel risk categories: model hallucination, prompt injection, data poisoning, and AI supply chain attacks. Without a formal risk management framework, these AI-specific risks are neither identified nor mitigated.",
        requiredActions: [
          { action: "Document risk management framework covering AI-specific risk categories", configPath: "/app/compliance", automated: false },
          { action: "Review security posture dashboard for current risk indicators", configPath: "/app/compliance", automated: true },
          { action: "Schedule regular risk assessment reviews (at least annually)", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CSA.GOV.3",
      framework: "csa_star" as ComplianceFramework,
      title: "Regulatory Compliance",
      description:
        "Identify, evaluate, and maintain compliance with all relevant legislative, regulatory, and contractual requirements applicable to the organization's cloud services.",
      category: "Governance",
      guidance: {
        learnMore:
          "CSA CCM GRC-03 requires identifying all applicable laws, regulations, and contractual obligations and demonstrating compliance. This includes data protection laws (GDPR, CCPA, DPDP), industry regulations, and customer contractual requirements.",
        whyItMatters:
          "Cloud-based AI services operate across jurisdictions with different regulatory requirements. Non-compliance in any jurisdiction can result in fines, service bans, and loss of customer trust across all markets.",
        requiredActions: [
          { action: "Map applicable regulatory requirements across all operating jurisdictions", configPath: "/app/compliance", automated: false },
          { action: "Generate compliance reports for each applicable framework", configPath: "/app/compliance", automated: true },
          { action: "Document compliance status and remediation plans for each regulation", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CSA.GOV.4",
      framework: "csa_star" as ComplianceFramework,
      title: "Information Security Roles and Responsibilities",
      description:
        "Define and assign information security roles and responsibilities for cloud services, including separation of duties and clear escalation paths.",
      category: "Governance",
      guidance: {
        learnMore:
          "CSA CCM HRS-01 requires clearly defined security roles with specific responsibilities for cloud service operations. This includes data owners, security administrators, incident responders, and compliance officers.",
        whyItMatters:
          "In a multi-tenant AI platform, unclear role assignments lead to gaps in security coverage. If nobody is responsible for monitoring Claw security policies, policy drift goes undetected and customer data is at risk.",
        requiredActions: [
          { action: "Define RBAC roles mapping to CSA security responsibilities", configPath: "/app/roles", automated: true },
          { action: "Assign security-specific roles (security admin, compliance officer)", configPath: "/app/roles", automated: true },
          { action: "Document the RACI matrix for information security responsibilities", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // Operations
    // ═══════════════════════════════════════════════════════════════
    {
      id: "CSA.OPS.1",
      framework: "csa_star" as ComplianceFramework,
      title: "Change Management",
      description:
        "Implement change management processes to ensure that all changes to cloud services are documented, authorized, tested, and reviewed before deployment.",
      category: "Operations",
      guidance: {
        learnMore:
          "CSA CCM CCC-01 requires formal change management covering request, assessment, approval, implementation, and review. All changes to Claw configurations, OPA policies, RBAC roles, and infrastructure must follow this process.",
        whyItMatters:
          "Unauthorized or untested changes to cloud AI services can simultaneously affect all tenants. A misconfigured OPA policy could expose all organizations' data; a broken Claw update could disrupt all customer-facing AI interactions.",
        requiredActions: [
          { action: "Enable comprehensive audit logging for all configuration changes", configPath: "/app/compliance", automated: true },
          { action: "Configure OPA policies requiring approval for production changes", configPath: "/app/claw-policies", automated: true },
          { action: "Document change management procedures and approval workflows", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CSA.OPS.2",
      framework: "csa_star" as ComplianceFramework,
      title: "Data Center Security",
      description:
        "Implement physical and environmental security controls for data centers and cloud infrastructure hosting the service, including access controls, monitoring, and environmental protections.",
      category: "Operations",
      guidance: {
        learnMore:
          "CSA CCM DCS-01 covers physical security of data center facilities. For cloud-hosted AI platforms, this primarily relies on the cloud provider's physical security but must be verified and documented in the shared responsibility model.",
        whyItMatters:
          "While cloud providers handle physical security, AI platforms must verify these controls exist and are adequate. Data residency requirements may dictate which data centers can host AI processing for specific customer segments.",
        requiredActions: [
          { action: "Document the shared responsibility model with cloud infrastructure providers", configPath: "/app/compliance", automated: false },
          { action: "Configure deployment region settings to enforce data residency requirements", configPath: "/app/compliance", automated: true },
          { action: "Verify cloud provider physical security certifications (SOC 2, ISO 27001)", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CSA.OPS.3",
      framework: "csa_star" as ComplianceFramework,
      title: "Encryption and Key Management",
      description:
        "Implement encryption for data at rest and in transit, with formal key management processes covering generation, distribution, storage, rotation, and destruction.",
      category: "Operations",
      guidance: {
        learnMore:
          "CSA CCM EKM-01 through EKM-04 require comprehensive encryption and key management. All data must be encrypted at rest (AES-256) and in transit (TLS 1.2+). Encryption keys must be managed through a formal lifecycle.",
        whyItMatters:
          "AI platforms process sensitive data from multiple organizations. Without encryption, a storage breach exposes all tenant data. Key management failures can make encrypted data permanently inaccessible, causing data loss.",
        requiredActions: [
          { action: "Verify encryption at rest and in transit for all data stores", configPath: "/app/compliance", automated: true },
          { action: "Implement encryption key rotation schedule", configPath: "/app/compliance", automated: false },
          { action: "Document key management procedures covering the full key lifecycle", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CSA.OPS.4",
      framework: "csa_star" as ComplianceFramework,
      title: "Vulnerability Management",
      description:
        "Implement a vulnerability management program that includes regular scanning, risk-based prioritization, and timely remediation of identified vulnerabilities.",
      category: "Operations",
      guidance: {
        learnMore:
          "CSA CCM TVM-01 requires systematic vulnerability management. For AI platforms, this extends beyond traditional infrastructure scanning to include AI-specific vulnerabilities: prompt injection, model manipulation, and supply chain attacks on ML libraries.",
        whyItMatters:
          "AI platforms face a broader vulnerability surface than traditional cloud services. In addition to infrastructure vulnerabilities, adversarial AI attacks can compromise model integrity, data confidentiality, and output reliability.",
        requiredActions: [
          { action: "Configure OPA policies to detect and mitigate known AI attack patterns", configPath: "/app/claw-policies", automated: true },
          { action: "Enable security monitoring for anomalous Claw behavior", configPath: "/app/compliance", automated: true },
          { action: "Document the vulnerability management program including AI-specific threat vectors", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CSA.OPS.5",
      framework: "csa_star" as ComplianceFramework,
      title: "Incident Management",
      description:
        "Establish and maintain an incident management program that includes detection, response, notification, and post-incident review for security incidents affecting cloud services.",
      category: "Operations",
      guidance: {
        learnMore:
          "CSA CCM SEF-01 through SEF-05 require comprehensive incident management. This includes 24/7 detection capability, defined response procedures, customer notification processes, evidence preservation, and post-incident analysis.",
        whyItMatters:
          "Multi-tenant AI platform incidents can affect multiple organizations simultaneously. Rapid detection and coordinated response are critical to contain impact. Customers expect transparent notification and demonstrated remediation.",
        requiredActions: [
          { action: "Configure real-time alerting for security-critical audit events", configPath: "/app/compliance", automated: true },
          { action: "Document incident response procedures covering AI-specific incident types", configPath: "/app/compliance", automated: false },
          { action: "Establish customer notification procedures for security incidents", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // Data Security
    // ═══════════════════════════════════════════════════════════════
    {
      id: "CSA.DATA.1",
      framework: "csa_star" as ComplianceFramework,
      title: "Data Inventory and Flows",
      description:
        "Maintain an inventory of all data processed, stored, and transmitted by cloud services, including data flows between components and third parties.",
      category: "Data Security",
      guidance: {
        learnMore:
          "CSA CCM DSP-01 requires knowing what data exists, where it resides, how it flows, and who accesses it. For an AI platform, this includes data flowing into Claws (inputs), data generated by AI models (outputs), and data cached or logged during processing.",
        whyItMatters:
          "AI platforms have complex data flows: user input goes to Claws, Claws query data sources, data flows to AI model providers, responses are cached and logged. Without a complete data flow map, data leakage points are invisible.",
        requiredActions: [
          { action: "Catalog all Claws with their data sources and destinations", configPath: "/app/claws", automated: true },
          { action: "Map data flows between Claws, AI model providers, and data stores", configPath: "/app/compliance", automated: false },
          { action: "Document all third-party data sharing relationships", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CSA.DATA.2",
      framework: "csa_star" as ComplianceFramework,
      title: "Data Classification",
      description:
        "Implement a data classification scheme that categorizes data based on sensitivity, regulatory requirements, and business impact to apply appropriate security controls.",
      category: "Data Security",
      guidance: {
        learnMore:
          "CSA CCM DSP-02 requires a formal classification scheme (e.g., public, internal, confidential, restricted) applied consistently to all data. Classification drives access controls, encryption requirements, and retention policies.",
        whyItMatters:
          "Without data classification, all data receives the same (often minimal) protection. An AI Claw processing public FAQs gets the same controls as one processing restricted financial data — meaning either over-protection or under-protection.",
        requiredActions: [
          { action: "Assign data classification levels to all Claws", configPath: "/app/claws", automated: true },
          { action: "Configure OPA policies enforcing classification-based access controls", configPath: "/app/claw-policies", automated: true },
          { action: "Document the data classification scheme and handling requirements for each level", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CSA.DATA.3",
      framework: "csa_star" as ComplianceFramework,
      title: "Data Retention and Disposal",
      description:
        "Define and implement data retention and disposal policies that specify how long data is kept, when it is archived, and how it is securely destroyed when no longer needed.",
      category: "Data Security",
      guidance: {
        learnMore:
          "CSA CCM DSP-03 requires formal retention policies specifying time periods for each data category, archival procedures, and secure disposal methods. Data must be destroyed in a manner preventing recovery.",
        whyItMatters:
          "AI platforms accumulate vast amounts of data through inference logs, audit trails, and cached model outputs. Without retention policies, data grows indefinitely, increasing breach exposure and storage costs while violating regulatory requirements.",
        requiredActions: [
          { action: "Configure data retention policies for audit logs and inference records", configPath: "/app/compliance", automated: true },
          { action: "Implement automated data disposal for records exceeding retention periods", configPath: "/app/compliance", automated: false },
          { action: "Document retention periods for each data category and the legal basis", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CSA.DATA.4",
      framework: "csa_star" as ComplianceFramework,
      title: "Data Privacy",
      description:
        "Implement controls to protect personal data processed by cloud services in compliance with applicable privacy laws and contractual obligations.",
      category: "Data Security",
      guidance: {
        learnMore:
          "CSA CCM DSP-04 requires privacy-by-design controls including data minimization, purpose limitation, consent management, and data subject rights handling. This must comply with all applicable privacy regulations (GDPR, CCPA, DPDP).",
        whyItMatters:
          "A multi-jurisdictional AI platform must comply with the strictest applicable privacy law for each customer. Privacy failures in one jurisdiction can trigger enforcement actions and loss of trust globally.",
        requiredActions: [
          { action: "Identify Claws processing personal data and apply enhanced privacy controls", configPath: "/app/claws", automated: true },
          { action: "Configure data minimization policies for AI processing pipelines", configPath: "/app/claw-policies", automated: true },
          { action: "Implement data subject rights request handling procedures", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CSA.DATA.5",
      framework: "csa_star" as ComplianceFramework,
      title: "Data Portability",
      description:
        "Provide the ability for customers to retrieve their data in a commonly used, machine-readable format and transfer it to another provider without hindrance.",
      category: "Data Security",
      guidance: {
        learnMore:
          "CSA CCM DSP-05 requires that customers can export their data in standard formats (JSON, CSV, etc.) without vendor lock-in. This includes Claw configurations, audit logs, processing history, and any custom models or training data.",
        whyItMatters:
          "Vendor lock-in is a major concern for enterprise AI platform customers. The inability to export data and configurations means customers cannot switch providers, giving them no leverage to demand security improvements.",
        requiredActions: [
          { action: "Implement data export functionality for all customer data categories", configPath: "/app/compliance", automated: false },
          { action: "Support standard data formats (JSON, CSV) for all export operations", configPath: "/app/compliance", automated: false },
          { action: "Document the data portability process and available export formats", configPath: "/app/compliance", automated: false },
        ],
      },
    },
  ];
}
