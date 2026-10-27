/**
 * Extended Compliance Frameworks
 *
 * PCI DSS v4.0, NIST CSF 2.0, and FedRAMP Moderate controls
 * for the Wtrops.ai compliance engine.
 */

import type { ControlDefinition } from "./compliance-report.service";

// ══════════════════════════════════════════════════════════════════════
// PCI DSS v4.0 Controls
// ══════════════════════════════════════════════════════════════════════

export function getPciDssControls(): Omit<ControlDefinition, "status" | "evidence">[] {
  return [
    // ═══════════════════════════════════════════════════════════════
    // Requirement 1-2 — Network Security
    // ═══════════════════════════════════════════════════════════════
    {
      id: "PCI-1.1",
      framework: "pci_dss",
      title: "Install and maintain network security controls",
      description: "Network security controls (NSCs) such as firewalls and network segmentation shall be installed, configured, and maintained to protect cardholder data environments from unauthorized network traffic.",
      category: "Req 1-2 Network Security",
      guidance: {
        learnMore: "PCI DSS Requirement 1 mandates that firewalls and routers are properly configured to restrict inbound and outbound traffic to only what is necessary for the cardholder data environment. This includes maintaining a current network diagram, restricting connections between untrusted networks and CDE components, and implementing a DMZ to limit inbound traffic.",
        whyItMatters: "Without properly configured network security controls, attackers can gain direct access to systems that store, process, or transmit cardholder data, leading to large-scale data breaches and significant financial liability under PCI DSS.",
        requiredActions: [
          { action: "Configure network segmentation policies to isolate cardholder data environments in Claw fleet", configPath: "/app/claw-fleet", automated: true },
          { action: "Define OPA policies enforcing firewall rules for API gateway traffic", configPath: "/app/claw-policies", automated: true },
          { action: "Document network topology and data flow diagrams for CDE", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "PCI-1.2",
      framework: "pci_dss",
      title: "Restrict use of default passwords and security parameters",
      description: "Vendor-supplied defaults for system passwords and other security parameters shall not be used. All default credentials must be changed before systems are deployed into production.",
      category: "Req 1-2 Network Security",
      guidance: {
        learnMore: "Default passwords and security settings are well-known to attackers and readily available in public databases. Every system component must have vendor-supplied defaults removed or changed, including passwords, SNMP community strings, and unnecessary default accounts.",
        whyItMatters: "Default credentials are the most commonly exploited vulnerability in payment systems. Attackers routinely scan for systems using default passwords, and a single default account can compromise an entire cardholder data environment.",
        requiredActions: [
          { action: "Enforce password policy requiring unique credentials for all system accounts", configPath: "/app/settings", automated: true },
          { action: "Configure RBAC to disable or rename all default administrative accounts", configPath: "/app/roles", automated: true },
          { action: "Audit all service accounts and API keys for default or weak credentials", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "PCI-1.3",
      framework: "pci_dss",
      title: "Protect stored cardholder data with network controls",
      description: "Network access to and from the cardholder data environment shall be restricted through network security controls to only traffic that is necessary for business operations.",
      category: "Req 1-2 Network Security",
      guidance: {
        learnMore: "Traffic entering and leaving the CDE must be explicitly authorized. Deny-all rules should be the default, with explicit allow rules only for traffic required for business purposes. Internal traffic between CDE components must also be controlled.",
        whyItMatters: "Overly permissive network rules create attack paths that allow lateral movement within the network once an attacker gains initial access, potentially exposing millions of cardholder records.",
        requiredActions: [
          { action: "Implement deny-by-default OPA policies for all CDE-related Claw operations", configPath: "/app/claw-policies", automated: true },
          { action: "Configure Claw fleet monitoring to alert on unauthorized network access patterns", configPath: "/app/claw-fleet", automated: true },
          { action: "Review and document all allowed network traffic flows quarterly", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "PCI-1.4",
      framework: "pci_dss",
      title: "Encrypt transmission of cardholder data across open networks",
      description: "Strong cryptography shall be used to protect cardholder data during transmission over open, public networks, including the internet, wireless technologies, and cellular technologies.",
      category: "Req 1-2 Network Security",
      guidance: {
        learnMore: "All cardholder data transmitted over public networks must be encrypted using strong cryptography (TLS 1.2 or higher). This applies to all communication channels including web traffic, email, instant messaging, SMS, and any other transmission method.",
        whyItMatters: "Unencrypted cardholder data traversing public networks can be intercepted by anyone with network access, including attackers using readily available packet sniffing tools, leading to immediate card fraud.",
        requiredActions: [
          { action: "Enforce TLS 1.2+ for all API and telephony communication channels", configPath: "/app/telephony", automated: true },
          { action: "Configure OPA policies to reject unencrypted data transmission attempts", configPath: "/app/claw-policies", automated: true },
          { action: "Document encryption protocols used for all data-in-transit pathways", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "PCI-1.5",
      framework: "pci_dss",
      title: "Deploy anti-virus and anti-malware solutions",
      description: "Anti-malware solutions shall be deployed on all systems commonly affected by malware, with active monitoring and regular updates to signature databases.",
      category: "Req 1-2 Network Security",
      guidance: {
        learnMore: "Anti-malware software must be deployed on all system components that are commonly affected by malicious software, including servers, workstations, and point-of-sale terminals. Solutions must be kept current, actively running, and generating audit logs.",
        whyItMatters: "Malware is a primary vector for data exfiltration in payment environments. Without active anti-malware protection, attackers can install keyloggers, RAM scrapers, and other tools designed specifically to capture cardholder data from memory.",
        requiredActions: [
          { action: "Enable continuous monitoring on all Claw fleet instances for malicious payloads", configPath: "/app/claw-fleet", automated: true },
          { action: "Configure OPA policies to scan and block known malicious prompt patterns", configPath: "/app/claw-policies", automated: true },
          { action: "Maintain anti-malware deployment records and signature update logs", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "PCI-1.6",
      framework: "pci_dss",
      title: "Develop and maintain secure systems and applications",
      description: "All system components shall be developed securely following industry best practices, with security vulnerabilities identified and addressed during the software development lifecycle.",
      category: "Req 1-2 Network Security",
      guidance: {
        learnMore: "All custom and commercial software must be developed according to secure coding guidelines. This includes conducting code reviews, applying security testing during development, and ensuring that public-facing web applications are protected against known attack vectors.",
        whyItMatters: "Insecure application code is a leading cause of payment data breaches. Vulnerabilities like SQL injection, cross-site scripting, and insecure API endpoints can be exploited to extract cardholder data directly from applications.",
        requiredActions: [
          { action: "Configure OPA policies enforcing secure coding standards for Claw configurations", configPath: "/app/claw-policies", automated: true },
          { action: "Enable automated security scanning in Claw fleet deployment pipeline", configPath: "/app/claw-fleet", automated: true },
          { action: "Document secure development lifecycle processes and code review requirements", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // Requirement 3-4 — Data Protection
    // ═══════════════════════════════════════════════════════════════
    {
      id: "PCI-3.1",
      framework: "pci_dss",
      title: "Protect stored cardholder data",
      description: "Stored cardholder data shall be protected using strong cryptography, truncation, masking, or hashing. The primary account number (PAN) must be rendered unreadable anywhere it is stored.",
      category: "Req 3-4 Data Protection",
      guidance: {
        learnMore: "PAN must be rendered unreadable using one-way hashing, truncation, index tokens, or strong encryption with associated key management processes. The encryption method must render the PAN unreadable even if an attacker gains access to the stored data.",
        whyItMatters: "If cardholder data is stored in plaintext, a single database breach exposes all stored PANs. Proper encryption ensures that even if storage is compromised, the data remains unusable to attackers.",
        requiredActions: [
          { action: "Configure data classification policies to identify and protect cardholder data fields", configPath: "/app/claw-policies", automated: true },
          { action: "Enable encryption-at-rest for all data stores accessible by Claw copilot queries", configPath: "/app/copilot", automated: true },
          { action: "Document data storage locations and encryption methods for all cardholder data", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "PCI-3.2",
      framework: "pci_dss",
      title: "Encrypt transmission of cardholder data",
      description: "Cardholder data shall be encrypted with strong cryptography whenever it is transmitted across any network, and security protocols shall be validated to only use trusted keys and certificates.",
      category: "Req 3-4 Data Protection",
      guidance: {
        learnMore: "Sensitive authentication data must never be stored after authorization, even if encrypted. All transmission paths must use strong cryptography with validated certificates. Wireless networks transmitting cardholder data require additional protections.",
        whyItMatters: "Data-in-transit is vulnerable to interception at multiple points. Without strong encryption, cardholder data can be captured by man-in-the-middle attacks, rogue wireless access points, or compromised network infrastructure.",
        requiredActions: [
          { action: "Enforce end-to-end encryption for all telephony channels handling sensitive data", configPath: "/app/telephony", automated: true },
          { action: "Configure OPA policies to block transmission of unmasked cardholder data", configPath: "/app/claw-policies", automated: true },
          { action: "Maintain an inventory of all encryption certificates and their expiration dates", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "PCI-3.3",
      framework: "pci_dss",
      title: "Cryptographic key management",
      description: "Cryptographic keys used to protect stored cardholder data shall be managed with documented key management processes covering the full key lifecycle including generation, distribution, storage, rotation, and destruction.",
      category: "Req 3-4 Data Protection",
      guidance: {
        learnMore: "Key management procedures must cover the entire lifecycle: generation using strong random number generators, secure distribution, storage in the fewest possible locations, rotation at least annually, and secure destruction when keys are retired. Split knowledge and dual control must be used for manual key operations.",
        whyItMatters: "Even the strongest encryption is worthless if encryption keys are poorly managed. Compromised keys give attackers the ability to decrypt all data protected by those keys, potentially affecting years of stored cardholder data.",
        requiredActions: [
          { action: "Configure automated API key rotation policies in application settings", configPath: "/app/settings", automated: true },
          { action: "Define OPA policies enforcing key management standards for data encryption", configPath: "/app/claw-policies", automated: true },
          { action: "Document key management procedures including generation, rotation, and destruction processes", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "PCI-3.4",
      framework: "pci_dss",
      title: "Data retention policy",
      description: "A data retention and disposal policy shall be implemented that limits cardholder data storage to the minimum amount and time necessary for business, legal, and regulatory purposes.",
      category: "Req 3-4 Data Protection",
      guidance: {
        learnMore: "Organizations must define data retention requirements for each data type, implement automatic deletion of data that exceeds the retention period, and conduct quarterly reviews to verify that stored cardholder data does not exceed defined retention periods.",
        whyItMatters: "Retaining cardholder data longer than necessary increases the scope and impact of a potential breach. Every stored record is a liability — minimizing retention reduces both risk exposure and compliance burden.",
        requiredActions: [
          { action: "Configure automated data retention policies for query history and audit logs", configPath: "/app/settings", automated: true },
          { action: "Define OPA policies enforcing maximum data retention periods", configPath: "/app/claw-policies", automated: true },
          { action: "Schedule quarterly data retention audits and document disposal records", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "PCI-3.5",
      framework: "pci_dss",
      title: "Data masking for display",
      description: "The primary account number (PAN) shall be masked when displayed, with only the minimum number of digits necessary for business purposes shown to authorized personnel.",
      category: "Req 3-4 Data Protection",
      guidance: {
        learnMore: "PAN display must show no more than the first six and last four digits. Full PAN should only be viewable by those with a documented business need. Masking must apply to all display channels including screens, reports, receipts, and logs.",
        whyItMatters: "Displaying full PANs creates opportunities for visual capture by unauthorized individuals. A single shoulder-surfing incident or screenshot of an unmasked PAN can result in card fraud and PCI DSS non-compliance.",
        requiredActions: [
          { action: "Configure data masking rules for sensitive fields in Copilot query responses", configPath: "/app/copilot", automated: true },
          { action: "Define OPA policies enforcing PAN masking in all output channels", configPath: "/app/claw-policies", automated: true },
          { action: "Document which roles are authorized to view unmasked cardholder data", configPath: "/app/roles", automated: false },
        ],
      },
    },
    {
      id: "PCI-3.6",
      framework: "pci_dss",
      title: "Secure data deletion",
      description: "Cardholder data shall be securely deleted when no longer needed, using methods that render the data unrecoverable, including cryptographic erasure or physical destruction of storage media.",
      category: "Req 3-4 Data Protection",
      guidance: {
        learnMore: "Secure deletion must go beyond simple file deletion. Methods include cryptographic erasure (destroying encryption keys), overwriting data with random patterns, degaussing magnetic media, or physical destruction. Deletion must be verified and documented.",
        whyItMatters: "Standard file deletion only removes the file system pointer, leaving data fully recoverable with forensic tools. Without secure deletion, discarded storage media or decommissioned systems can become sources of cardholder data breaches.",
        requiredActions: [
          { action: "Configure automated secure deletion workflows for expired data in application settings", configPath: "/app/settings", automated: true },
          { action: "Define OPA policies ensuring data deletion meets cryptographic erasure standards", configPath: "/app/claw-policies", automated: true },
          { action: "Maintain secure deletion certificates and disposal records", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // Requirement 5-6 — Vulnerability Management
    // ═══════════════════════════════════════════════════════════════
    {
      id: "PCI-5.1",
      framework: "pci_dss",
      title: "Deploy anti-malware on all systems",
      description: "Anti-malware solutions shall be deployed on all system components that are commonly affected by malicious software, with mechanisms to detect, prevent, and alert on malware activity.",
      category: "Req 5-6 Vulnerability Management",
      guidance: {
        learnMore: "Anti-malware must be deployed on all systems where malware is a risk, maintained with current definitions, configured for periodic scans and real-time monitoring, and configured to generate audit logs. Systems not commonly affected by malware require periodic evaluations to confirm they remain low-risk.",
        whyItMatters: "Malware designed to target payment systems evolves rapidly. Without comprehensive anti-malware coverage, RAM-scraping malware and advanced persistent threats can operate undetected for months, exfiltrating cardholder data continuously.",
        requiredActions: [
          { action: "Enable real-time threat detection across all Claw fleet instances", configPath: "/app/claw-fleet", automated: true },
          { action: "Configure OPA policies to detect and block malicious payload patterns in AI prompts", configPath: "/app/claw-policies", automated: true },
          { action: "Document anti-malware coverage assessment for all system components", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "PCI-5.2",
      framework: "pci_dss",
      title: "Develop and maintain secure systems and applications",
      description: "All system components and software shall be protected from known vulnerabilities by installing applicable security patches within a defined timeframe.",
      category: "Req 5-6 Vulnerability Management",
      guidance: {
        learnMore: "All vendor-supplied security patches must be evaluated and installed. Critical patches must be installed within one month of release. Custom and commercial applications must follow secure development practices including code reviews, vulnerability testing, and separation of development and production environments.",
        whyItMatters: "Unpatched systems are the most exploited attack vector in payment breaches. Known vulnerabilities with published exploits allow even unsophisticated attackers to compromise payment systems remotely.",
        requiredActions: [
          { action: "Configure automated dependency update monitoring in Claw fleet deployment settings", configPath: "/app/claw-fleet", automated: true },
          { action: "Enable vulnerability scanning policies for all deployed Claw instances", configPath: "/app/claw-policies", automated: true },
          { action: "Establish and document a patch management schedule with defined SLAs for critical patches", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "PCI-5.3",
      framework: "pci_dss",
      title: "Patch management process",
      description: "A formal patch management process shall be established to identify, evaluate, test, and deploy security patches for all system components within defined timeframes based on risk ranking.",
      category: "Req 5-6 Vulnerability Management",
      guidance: {
        learnMore: "The patch management process must include identification of applicable patches, risk-based prioritization, testing before production deployment, and verification of successful installation. Critical and high-risk patches must be applied within 30 days of release.",
        whyItMatters: "Without a structured patch management process, critical security updates are missed or delayed, leaving known vulnerabilities open for exploitation. Many major payment breaches exploited vulnerabilities for which patches were available months before the attack.",
        requiredActions: [
          { action: "Configure automated patch notification and tracking in system settings", configPath: "/app/settings", automated: true },
          { action: "Enable Claw fleet health monitoring to detect outdated system components", configPath: "/app/claw-fleet", automated: true },
          { action: "Document patch management procedures including testing, approval, and rollback processes", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "PCI-5.4",
      framework: "pci_dss",
      title: "Change control procedures",
      description: "Formal change control procedures shall be established for all changes to system components, including documentation of impact, management approval, testing, and back-out procedures.",
      category: "Req 5-6 Vulnerability Management",
      guidance: {
        learnMore: "All changes to the CDE must follow a formal change management process: document the change request, assess security impact, obtain appropriate approval, test in a non-production environment, implement back-out procedures, and verify the change after deployment.",
        whyItMatters: "Uncontrolled changes are a leading cause of security misconfigurations. Without formal change control, security settings can be inadvertently weakened, new vulnerabilities introduced, and audit trails lost.",
        requiredActions: [
          { action: "Enable audit logging for all Claw policy and configuration changes", configPath: "/app/claw-policies", automated: true },
          { action: "Configure approval workflows for production changes in role-based settings", configPath: "/app/roles", automated: true },
          { action: "Document change management procedures including impact assessment and approval workflows", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "PCI-5.5",
      framework: "pci_dss",
      title: "Secure coding practices",
      description: "Applications shall be developed using secure coding techniques that prevent common software vulnerabilities, with developers trained on secure coding practices relevant to their development environment.",
      category: "Req 5-6 Vulnerability Management",
      guidance: {
        learnMore: "Development teams must follow secure coding guidelines that address common vulnerabilities (OWASP Top 10), perform code reviews for security flaws, and undergo regular training on secure development practices. Public-facing web applications must also be protected by a web application firewall (WAF) or undergo annual application penetration testing.",
        whyItMatters: "Application-layer attacks account for the majority of payment data breaches. Secure coding practices prevent vulnerabilities like injection flaws, broken authentication, and insecure direct object references that attackers exploit to access cardholder data.",
        requiredActions: [
          { action: "Configure OPA policies validating input sanitization and output encoding in Claw operations", configPath: "/app/claw-policies", automated: true },
          { action: "Enable secure code analysis rules in Claw fleet deployment pipeline", configPath: "/app/claw-fleet", automated: true },
          { action: "Document secure coding standards and training requirements for development team", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // Requirement 7-8 — Access Control
    // ═══════════════════════════════════════════════════════════════
    {
      id: "PCI-7.1",
      framework: "pci_dss",
      title: "Restrict access to cardholder data by business need-to-know",
      description: "Access to system components and cardholder data shall be limited to only those individuals whose job requires such access. Access rights must be granted based on the least privilege principle.",
      category: "Req 7-8 Access Control",
      guidance: {
        learnMore: "Access control systems must restrict access based on job classification and function. A documented access control policy must define access needs for each role, and access must default to deny-all. All access grants must be authorized by management and documented.",
        whyItMatters: "Granting broad access to cardholder data increases the number of potential entry points for attackers and makes insider threats more dangerous. Least-privilege access ensures that a compromised account can only access the minimum data necessary for its role.",
        requiredActions: [
          { action: "Configure role-based access control with least-privilege defaults for all user roles", configPath: "/app/roles", automated: true },
          { action: "Define OPA policies enforcing need-to-know access restrictions on cardholder data", configPath: "/app/claw-policies", automated: true },
          { action: "Document business justification for each role's access level to cardholder data", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "PCI-7.2",
      framework: "pci_dss",
      title: "Assign unique IDs to each person with computer access",
      description: "All users shall be assigned a unique identification (user ID) before being allowed access to system components or cardholder data, ensuring individual accountability for all actions.",
      category: "Req 7-8 Access Control",
      guidance: {
        learnMore: "Every individual with access to the CDE must have a unique user ID. Shared, group, or generic accounts are prohibited for administrative access. Each action must be traceable to an individual user through their unique identifier.",
        whyItMatters: "Shared accounts make it impossible to trace actions to specific individuals, undermining accountability and incident investigation. When a breach occurs through a shared account, identifying the responsible party becomes nearly impossible.",
        requiredActions: [
          { action: "Enforce unique user identification for all accounts in the RBAC system", configPath: "/app/roles", automated: true },
          { action: "Configure audit logging to record individual user IDs for all system actions", configPath: "/app/compliance", automated: true },
          { action: "Prohibit shared and generic accounts through organization-wide access policy", configPath: "/app/settings", automated: false },
        ],
      },
    },
    {
      id: "PCI-7.3",
      framework: "pci_dss",
      title: "Multi-factor authentication",
      description: "Multi-factor authentication (MFA) shall be implemented for all remote access to the cardholder data environment and for all non-console administrative access to CDE systems.",
      category: "Req 7-8 Access Control",
      guidance: {
        learnMore: "MFA requires at least two of the three authentication factors: something you know (password), something you have (token/smart card), something you are (biometric). MFA must be implemented for all remote network access and all non-console administrative access to CDE components.",
        whyItMatters: "Single-factor authentication is easily defeated through phishing, credential stuffing, and brute force attacks. MFA reduces the risk of unauthorized access by over 99% compared to password-only authentication.",
        requiredActions: [
          { action: "Enable multi-factor authentication requirements for all administrative roles", configPath: "/app/settings", automated: true },
          { action: "Configure OPA policies requiring MFA verification for sensitive operations", configPath: "/app/claw-policies", automated: true },
          { action: "Document MFA implementation coverage and exceptions", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "PCI-7.4",
      framework: "pci_dss",
      title: "Password policy and credential management",
      description: "Authentication credentials shall be managed according to documented policies including minimum complexity, regular rotation, lockout after failed attempts, and secure storage.",
      category: "Req 7-8 Access Control",
      guidance: {
        learnMore: "Passwords must be at least 12 characters (or 8 if the system cannot support 12), contain both numeric and alphabetic characters, and be changed at least every 90 days. Accounts must lock after no more than 10 invalid login attempts, with a minimum lockout duration of 30 minutes.",
        whyItMatters: "Weak passwords are the most commonly exploited vulnerability in access control. Without strong password policies, brute-force attacks, dictionary attacks, and credential reuse can compromise accounts rapidly.",
        requiredActions: [
          { action: "Configure password complexity, rotation, and lockout policies in organization settings", configPath: "/app/settings", automated: true },
          { action: "Define OPA policies enforcing credential strength requirements for API keys and tokens", configPath: "/app/claw-policies", automated: true },
          { action: "Document password policy and communicate requirements to all users", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "PCI-7.5",
      framework: "pci_dss",
      title: "Service account management",
      description: "Service accounts and system accounts shall be managed with documented ownership, defined scope, restricted privileges, and regular review to ensure they remain necessary and properly configured.",
      category: "Req 7-8 Access Control",
      guidance: {
        learnMore: "Service accounts must be assigned to a named individual owner, restricted to the minimum necessary privileges, have interactive login disabled where possible, and be reviewed at least annually to confirm they are still needed and properly configured.",
        whyItMatters: "Service accounts often have elevated privileges and are frequently overlooked during access reviews. Unmanaged service accounts become persistent backdoors that attackers can exploit long after initial compromise.",
        requiredActions: [
          { action: "Maintain a registry of all service accounts with assigned ownership in role management", configPath: "/app/roles", automated: true },
          { action: "Configure automated service account privilege review and rotation schedules", configPath: "/app/settings", automated: true },
          { action: "Document service account inventory with business justification and review schedule", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // Requirement 9-10 — Physical Security & Monitoring
    // ═══════════════════════════════════════════════════════════════
    {
      id: "PCI-9.1",
      framework: "pci_dss",
      title: "Restrict physical access to cardholder data",
      description: "Physical access to systems storing, processing, or transmitting cardholder data shall be restricted using appropriate facility entry controls, visitor management, and media protection.",
      category: "Req 9-10 Physical & Monitoring",
      guidance: {
        learnMore: "Physical access controls must include facility entry restrictions for CDE areas, visitor identification and logging, physical protection of media containing cardholder data, and controls on distribution, transfer, and destruction of physical media.",
        whyItMatters: "Physical access bypasses all logical security controls. An attacker with physical access to CDE systems can install hardware keyloggers, copy data directly from storage, or introduce malware that is difficult to detect remotely.",
        requiredActions: [
          { action: "Configure access logging for all physical and virtual infrastructure access events", configPath: "/app/compliance", automated: true },
          { action: "Enable Claw fleet monitoring for unauthorized physical infrastructure access patterns", configPath: "/app/claw-fleet", automated: true },
          { action: "Document physical access control procedures and visitor management policy", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "PCI-9.2",
      framework: "pci_dss",
      title: "Log and monitor all access to cardholder data",
      description: "Automated audit trails shall be implemented for all system components to record user activities, exceptions, and security events, linking them to individual users.",
      category: "Req 9-10 Physical & Monitoring",
      guidance: {
        learnMore: "Audit trails must record all individual user access to cardholder data, all actions taken by any individual with root or administrative privileges, access to all audit trails, invalid logical access attempts, and use of identification and authentication mechanisms.",
        whyItMatters: "Without comprehensive audit trails, security incidents cannot be detected, investigated, or reconstructed. Complete logging is essential for identifying the scope of a breach and fulfilling notification requirements.",
        requiredActions: [
          { action: "Enable comprehensive audit logging for all data access operations across the platform", configPath: "/app/compliance", automated: true },
          { action: "Configure OPA policies to enforce audit trail generation for cardholder data access", configPath: "/app/claw-policies", automated: true },
          { action: "Establish log retention policies meeting the PCI DSS 12-month minimum", configPath: "/app/settings", automated: false },
        ],
      },
    },
    {
      id: "PCI-9.3",
      framework: "pci_dss",
      title: "Monitor and review security logs",
      description: "Security event logs shall be reviewed at least daily using automated tools or manual processes to identify anomalies, suspicious activity, and potential security incidents.",
      category: "Req 9-10 Physical & Monitoring",
      guidance: {
        learnMore: "Log reviews must occur at least daily for critical security events, including all security events, logs of CDE system components, logs of critical system components, and logs of servers performing security functions. Automated log monitoring tools should be used to reduce manual effort.",
        whyItMatters: "Logs are only valuable if they are actively reviewed. The average time to detect a payment breach is 197 days — daily log review dramatically reduces detection time and limits the extent of data compromise.",
        requiredActions: [
          { action: "Configure automated log analysis and alerting for suspicious activity patterns", configPath: "/app/claw-fleet", automated: true },
          { action: "Define OPA policies for real-time security event detection and escalation", configPath: "/app/claw-policies", automated: true },
          { action: "Document log review procedures and assign responsibility for daily reviews", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "PCI-9.4",
      framework: "pci_dss",
      title: "Time synchronization",
      description: "All critical system clocks and times shall be synchronized using time-synchronization technology to ensure accurate and consistent timestamps across all audit logs and security events.",
      category: "Req 9-10 Physical & Monitoring",
      guidance: {
        learnMore: "Time synchronization via NTP or similar technology must be implemented across all systems. Only designated central time servers should receive signals from external sources, and time data must be protected from unauthorized modification. Correct timestamps are essential for correlating events across systems.",
        whyItMatters: "Without synchronized clocks, audit log timestamps become unreliable, making it impossible to accurately reconstruct the sequence of events during a security incident. Attackers may exploit time discrepancies to hide their activities.",
        requiredActions: [
          { action: "Verify time synchronization across all Claw fleet instances", configPath: "/app/claw-fleet", automated: true },
          { action: "Configure consistent timestamp formats in all audit and logging configurations", configPath: "/app/settings", automated: true },
          { action: "Document time synchronization architecture and NTP source configuration", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // Requirement 11-12 — Testing & Policy
    // ═══════════════════════════════════════════════════════════════
    {
      id: "PCI-11.1",
      framework: "pci_dss",
      title: "Regular security testing",
      description: "The security of systems and networks shall be tested regularly through vulnerability scanning, including internal and external network vulnerability scans at least quarterly.",
      category: "Req 11-12 Testing & Policy",
      guidance: {
        learnMore: "Internal vulnerability scans must be performed at least quarterly and after any significant change. External vulnerability scans must be performed by a PCI SSC Approved Scanning Vendor (ASV) at least quarterly. Wireless analyzer scans must be performed quarterly to detect unauthorized wireless access points.",
        whyItMatters: "Regular security testing identifies new vulnerabilities before attackers can exploit them. Without quarterly scanning, newly discovered vulnerabilities may persist for months, giving attackers ample time to develop and deploy exploits.",
        requiredActions: [
          { action: "Configure automated security scanning schedules for all Claw fleet components", configPath: "/app/claw-fleet", automated: true },
          { action: "Enable periodic OPA policy compliance checks against security baselines", configPath: "/app/claw-policies", automated: true },
          { action: "Schedule and document quarterly vulnerability scan results with remediation plans", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "PCI-11.2",
      framework: "pci_dss",
      title: "Penetration testing",
      description: "Penetration testing shall be performed at least annually and after any significant infrastructure or application change, including both network-layer and application-layer tests.",
      category: "Req 11-12 Testing & Policy",
      guidance: {
        learnMore: "Penetration testing must cover both internal and external network segments, include application-layer testing for custom applications, and test network segmentation controls to verify they are operational and effective. Tests must be performed by qualified internal or external resources.",
        whyItMatters: "Vulnerability scans identify known vulnerabilities, but penetration testing validates whether those vulnerabilities can actually be exploited and discovers complex attack chains that automated tools miss. It provides real-world validation of your security posture.",
        requiredActions: [
          { action: "Enable simulated attack detection policies in OPA to validate security controls", configPath: "/app/claw-policies", automated: true },
          { action: "Configure Claw fleet to support penetration testing in isolated environments", configPath: "/app/claw-fleet", automated: true },
          { action: "Document annual penetration test scope, results, and remediation actions", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "PCI-11.3",
      framework: "pci_dss",
      title: "Information security policy",
      description: "A comprehensive information security policy shall be established, published, maintained, and disseminated to all relevant personnel, with annual reviews and updates.",
      category: "Req 11-12 Testing & Policy",
      guidance: {
        learnMore: "The security policy must address all PCI DSS requirements, define information security responsibilities for all personnel, include an annual risk assessment process, define acceptable use of technologies, and require acknowledgment by all personnel. The policy must be reviewed at least annually and updated when the environment changes.",
        whyItMatters: "A comprehensive, current security policy is the foundation of PCI DSS compliance. Without it, security practices become inconsistent and ad hoc, leading to gaps that are routinely exploited in payment data breaches.",
        requiredActions: [
          { action: "Create and maintain a comprehensive security policy document in compliance records", configPath: "/app/compliance", automated: false },
          { action: "Configure OPA policy templates aligned with the organization's security policy", configPath: "/app/claw-policies", automated: true },
          { action: "Set up annual policy review schedule and track acknowledgment by all team members", configPath: "/app/teams", automated: false },
        ],
      },
    },
    {
      id: "PCI-11.4",
      framework: "pci_dss",
      title: "Risk assessment process",
      description: "A formal risk assessment process shall be implemented that identifies critical assets, threats, and vulnerabilities, and results in a formal, documented analysis of risk at least annually.",
      category: "Req 11-12 Testing & Policy",
      guidance: {
        learnMore: "The risk assessment must be performed at least annually and upon significant changes to the environment. It must identify critical assets, threats, and vulnerabilities; result in a formal risk ranking; and be used to prioritize remediation efforts. The methodology must be documented and consistently applied.",
        whyItMatters: "Without a formal risk assessment, security investments are based on assumptions rather than evidence. Organizations that do not assess risk systematically tend to over-invest in low-risk areas while leaving critical vulnerabilities unaddressed.",
        requiredActions: [
          { action: "Configure risk scoring and classification for all managed data assets", configPath: "/app/claw-policies", automated: true },
          { action: "Enable automated risk indicators from Claw fleet health monitoring data", configPath: "/app/claw-fleet", automated: true },
          { action: "Document annual risk assessment methodology, findings, and remediation priorities", configPath: "/app/compliance", automated: false },
        ],
      },
    },
  ];
}

// ══════════════════════════════════════════════════════════════════════
// NIST Cybersecurity Framework (CSF) 2.0 Controls
// ══════════════════════════════════════════════════════════════════════

export function getNistCsfControls(): Omit<ControlDefinition, "status" | "evidence">[] {
  return [
    // ═══════════════════════════════════════════════════════════════
    // GV — Govern
    // ═══════════════════════════════════════════════════════════════
    {
      id: "GV.OC-01",
      framework: "nist_csf",
      title: "Organizational context",
      description: "The organizational mission is understood and informs cybersecurity risk management. The circumstances — mission, stakeholder expectations, dependencies, and legal/regulatory requirements — surrounding the organization's cybersecurity risk management decisions are understood.",
      category: "GV Govern",
      guidance: {
        learnMore: "The organization must identify and document the business context in which cybersecurity decisions are made, including the organization's role in critical infrastructure, the nature of data processed, stakeholder expectations for data protection, and the regulatory landscape that governs its operations.",
        whyItMatters: "Cybersecurity decisions made without understanding organizational context lead to misaligned priorities. An AI SaaS platform handling sensitive data has different risk tolerance than a static website — context determines which risks matter most.",
        requiredActions: [
          { action: "Document organizational mission, data processing activities, and stakeholder expectations", configPath: "/app/compliance", automated: false },
          { action: "Configure team structure reflecting organizational units and their data responsibilities", configPath: "/app/teams", automated: true },
          { action: "Map regulatory requirements applicable to the organization's AI operations", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "GV.RM-01",
      framework: "nist_csf",
      title: "Risk management strategy",
      description: "A risk management strategy shall be established, communicated, and maintained that includes the organization's risk appetite, risk tolerance, and assumptions used to support risk decisions.",
      category: "GV Govern",
      guidance: {
        learnMore: "The risk management strategy defines the organization's approach to managing cybersecurity risk, including how risk is identified, assessed, responded to, and monitored. It should define risk appetite (the amount and type of risk the organization is willing to accept), risk tolerance thresholds, and criteria for risk acceptance decisions.",
        whyItMatters: "Without a defined risk management strategy, teams make inconsistent risk decisions. Clear risk appetite prevents both excessive risk-taking that leads to breaches and excessive risk-aversion that stifles AI innovation.",
        requiredActions: [
          { action: "Define risk appetite levels and thresholds for OPA policy enforcement decisions", configPath: "/app/claw-policies", automated: true },
          { action: "Configure risk scoring parameters for Claw fleet health assessments", configPath: "/app/claw-fleet", automated: true },
          { action: "Document the formal risk management strategy including risk appetite and tolerance levels", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "GV.RR-01",
      framework: "nist_csf",
      title: "Roles and responsibilities",
      description: "Organizational cybersecurity roles, responsibilities, and authorities related to risk management shall be established, communicated, and enforced to provide accountability and clear ownership.",
      category: "GV Govern",
      guidance: {
        learnMore: "Each cybersecurity function must have a clearly defined responsible party. This includes who is responsible for risk assessment, security operations, incident response, compliance monitoring, and communication with leadership. Roles must be documented and communicated to all relevant personnel.",
        whyItMatters: "Undefined cybersecurity roles create gaps in defense. When responsibility for security monitoring, incident response, or policy enforcement is unclear, critical tasks go unperformed and incidents escalate unnecessarily.",
        requiredActions: [
          { action: "Define and assign cybersecurity-specific RBAC roles with documented responsibilities", configPath: "/app/roles", automated: true },
          { action: "Configure team-based ownership for compliance domains and incident response", configPath: "/app/teams", automated: true },
          { action: "Document the cybersecurity organizational chart with authority levels and escalation paths", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "GV.PO-01",
      framework: "nist_csf",
      title: "Cybersecurity policy",
      description: "A cybersecurity policy shall be established based on organizational context, cybersecurity strategy, and priorities, and shall be communicated and enforced across the organization.",
      category: "GV Govern",
      guidance: {
        learnMore: "The cybersecurity policy must be approved by senior leadership, address all relevant regulatory requirements, define acceptable behavior and consequences for violations, cover the use of AI and machine learning technologies specifically, and be reviewed and updated regularly to reflect changes in threats and business objectives.",
        whyItMatters: "Policy is the bridge between strategy and operations. Without a clear, enforceable cybersecurity policy, the organization's risk management intentions remain aspirational rather than operational, leaving security dependent on individual judgment.",
        requiredActions: [
          { action: "Implement organizational security policies using OPA policy templates", configPath: "/app/claw-policies", automated: true },
          { action: "Configure policy compliance monitoring and violation alerting", configPath: "/app/compliance", automated: true },
          { action: "Document the cybersecurity policy and establish annual review schedule", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "GV.OV-01",
      framework: "nist_csf",
      title: "Cybersecurity oversight",
      description: "Cybersecurity risk management results shall be reviewed at the organizational level to inform and adjust the overall strategy. Leadership shall maintain ongoing oversight of cybersecurity risk posture.",
      category: "GV Govern",
      guidance: {
        learnMore: "Senior leadership must regularly review cybersecurity risk management activities and results. This includes reviewing risk assessments, incident reports, compliance status, and investment effectiveness. Governance processes must ensure that cybersecurity is integrated into enterprise risk management.",
        whyItMatters: "Cybersecurity without executive oversight leads to under-investment and misalignment with business objectives. Organizations with active leadership involvement in cybersecurity are significantly more effective at preventing and responding to incidents.",
        requiredActions: [
          { action: "Configure executive-level compliance dashboards and reporting schedules", configPath: "/app/compliance", automated: true },
          { action: "Enable Claw fleet health summary reports for leadership review", configPath: "/app/claw-fleet", automated: true },
          { action: "Establish regular cybersecurity review cadence with documented outcomes and action items", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // ID — Identify
    // ═══════════════════════════════════════════════════════════════
    {
      id: "ID.AM-01",
      framework: "nist_csf",
      title: "Asset management",
      description: "Inventories of hardware, software, services, and data assets managed by the organization shall be maintained and kept current to support cybersecurity risk management decisions.",
      category: "ID Identify",
      guidance: {
        learnMore: "The organization must maintain a current, complete inventory of all hardware devices, software platforms, applications, external information systems, network resources, and data flows. Each asset must have an assigned owner and a classification based on its criticality and sensitivity.",
        whyItMatters: "You cannot protect what you do not know you have. Unmanaged assets are unpatched, unmonitored, and uncontrolled — creating blind spots that attackers routinely exploit to gain initial access or establish persistence.",
        requiredActions: [
          { action: "Maintain a current inventory of all Claw instances and managed data stores", configPath: "/app/claw-fleet", automated: true },
          { action: "Configure data asset classification and ownership in Claw policies", configPath: "/app/claw-policies", automated: true },
          { action: "Document complete asset inventory with owners, classifications, and data flow maps", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "ID.RA-01",
      framework: "nist_csf",
      title: "Risk assessment",
      description: "Vulnerabilities in assets shall be identified, validated, and recorded. Risk assessments shall be conducted to identify threats, vulnerabilities, likelihood, and impact to organizational operations.",
      category: "ID Identify",
      guidance: {
        learnMore: "Risk assessments must identify internal and external threats, map vulnerabilities to assets, evaluate the likelihood and potential impact of each risk, and produce a prioritized risk register. Assessments must be updated when significant changes occur and at defined intervals.",
        whyItMatters: "Without systematic risk assessment, security resources are allocated based on intuition rather than evidence. This results in critical vulnerabilities remaining unaddressed while resources are spent on lower-priority items.",
        requiredActions: [
          { action: "Enable automated vulnerability detection and risk scoring in Claw fleet monitoring", configPath: "/app/claw-fleet", automated: true },
          { action: "Configure OPA policies with risk-based decision thresholds", configPath: "/app/claw-policies", automated: true },
          { action: "Conduct and document periodic risk assessments covering all AI operations", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "ID.IM-01",
      framework: "nist_csf",
      title: "Improvement",
      description: "Improvements to organizational cybersecurity risk management processes, procedures, and activities shall be identified across all CSF functions, incorporating lessons learned and evolving best practices.",
      category: "ID Identify",
      guidance: {
        learnMore: "Improvement activities must be integrated across all cybersecurity functions. This includes conducting post-incident reviews, analyzing trends in security events, benchmarking against industry peers, incorporating feedback from audits and assessments, and implementing a continuous improvement cycle.",
        whyItMatters: "Static security programs inevitably fall behind evolving threats. Continuous improvement ensures that lessons from incidents, near-misses, and industry developments are systematically incorporated into the organization's defenses.",
        requiredActions: [
          { action: "Configure trend analysis and improvement tracking in compliance dashboards", configPath: "/app/compliance", automated: true },
          { action: "Enable automated policy effectiveness metrics in Claw fleet reporting", configPath: "/app/claw-fleet", automated: true },
          { action: "Document improvement actions from incident reviews, audits, and assessments", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "ID.BE-01",
      framework: "nist_csf",
      title: "Business environment",
      description: "The organization's mission, objectives, stakeholders, activities, and supply chain shall be understood and prioritized to inform cybersecurity roles, responsibilities, and risk management decisions.",
      category: "ID Identify",
      guidance: {
        learnMore: "Understanding the business environment includes identifying the organization's role in the supply chain, critical business functions and their dependencies, resilience requirements for critical services, and the broader ecosystem in which the organization operates.",
        whyItMatters: "Cybersecurity investments that are disconnected from business priorities waste resources and leave critical functions unprotected. Understanding the business environment ensures security efforts align with what matters most to the organization.",
        requiredActions: [
          { action: "Map team structures to business functions and their criticality levels", configPath: "/app/teams", automated: true },
          { action: "Configure Claw policies reflecting business criticality of different data types", configPath: "/app/claw-policies", automated: true },
          { action: "Document critical business functions, dependencies, and their cybersecurity requirements", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "ID.SC-01",
      framework: "nist_csf",
      title: "Supply chain risk management",
      description: "Cyber supply chain risk management processes shall be identified, established, assessed, managed, and agreed to by organizational stakeholders, covering suppliers, third-party partners, and service providers.",
      category: "ID Identify",
      guidance: {
        learnMore: "Supply chain risk management must include identifying and documenting all third-party dependencies (including AI model providers, cloud services, and API integrations), assessing their security posture, establishing contractual security requirements, and monitoring for supply chain compromises.",
        whyItMatters: "Modern AI platforms depend on numerous third-party services, models, and libraries. A compromise in any supply chain component (such as a poisoned AI model or compromised API dependency) can cascade into a full platform breach.",
        requiredActions: [
          { action: "Maintain an inventory of all third-party integrations and AI model dependencies in Claw fleet", configPath: "/app/claw-fleet", automated: true },
          { action: "Configure OPA policies for third-party data access and model validation", configPath: "/app/claw-policies", automated: true },
          { action: "Document supply chain risk assessments and third-party security requirements", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // PR — Protect
    // ═══════════════════════════════════════════════════════════════
    {
      id: "PR.AA-01",
      framework: "nist_csf",
      title: "Identity management and access control",
      description: "Access to physical and logical assets shall be limited to authorized users, processes, and devices, managed consistently with the assessed risk of unauthorized access.",
      category: "PR Protect",
      guidance: {
        learnMore: "Identity management must include maintaining unique identities for all users, implementing strong authentication, managing access credentials securely, enforcing the principle of least privilege, and implementing separation of duties for critical functions.",
        whyItMatters: "Identity and access management is the primary control preventing unauthorized access to AI systems and data. Weak identity management enables credential-based attacks, the most common initial attack vector in cybersecurity breaches.",
        requiredActions: [
          { action: "Configure comprehensive RBAC with least-privilege assignments for all platform roles", configPath: "/app/roles", automated: true },
          { action: "Define OPA policies enforcing identity verification and access control rules", configPath: "/app/claw-policies", automated: true },
          { action: "Document the identity management lifecycle including provisioning, review, and deprovisioning", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "PR.AT-01",
      framework: "nist_csf",
      title: "Awareness and training",
      description: "The organization's personnel shall be provided with cybersecurity awareness education and adequate training to perform their information security-related duties and responsibilities.",
      category: "PR Protect",
      guidance: {
        learnMore: "All users must receive general cybersecurity awareness training, and personnel with security responsibilities must receive role-specific training. Training must cover the organization's security policies, AI-specific risks (prompt injection, data poisoning), social engineering, and incident reporting procedures.",
        whyItMatters: "Human error is responsible for the majority of security incidents. Trained employees are the most effective line of defense against phishing, social engineering, and accidental data exposure — threats that technology alone cannot fully address.",
        requiredActions: [
          { action: "Configure role-based security training requirements and track completion by team", configPath: "/app/teams", automated: true },
          { action: "Enable awareness notifications for security policy updates via platform communications", configPath: "/app/telephony", automated: true },
          { action: "Document training curriculum, completion records, and annual training schedule", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "PR.DS-01",
      framework: "nist_csf",
      title: "Data security",
      description: "Data shall be managed consistent with the organization's risk strategy to protect the confidentiality, integrity, and availability of information at rest, in transit, and in use.",
      category: "PR Protect",
      guidance: {
        learnMore: "Data security measures must include encryption of data at rest and in transit, data loss prevention mechanisms, integrity validation controls, secure data disposal procedures, and protection of data during processing (including AI/ML training and inference operations).",
        whyItMatters: "Data is the primary target of most cyberattacks. Comprehensive data security protections ensure that even if perimeter defenses are breached, cardholder data and sensitive AI models remain protected from unauthorized access and modification.",
        requiredActions: [
          { action: "Configure data classification and protection policies for all Claw-managed data", configPath: "/app/claw-policies", automated: true },
          { action: "Enable data access controls and masking in Copilot query responses", configPath: "/app/copilot", automated: true },
          { action: "Document data protection measures including encryption standards and data handling procedures", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "PR.PS-01",
      framework: "nist_csf",
      title: "Platform security",
      description: "The hardware, software, and services of physical and virtual platforms shall be managed consistent with the organization's risk strategy to protect their confidentiality, integrity, and availability.",
      category: "PR Protect",
      guidance: {
        learnMore: "Platform security encompasses configuration management, change control, software integrity verification, vulnerability management, and secure deployment practices for all systems. This includes hardening AI model serving infrastructure, securing API gateways, and maintaining platform component baselines.",
        whyItMatters: "Insecure platform configurations are a common attack vector. Misconfigured servers, unpatched software, and overly permissive settings create opportunities for attackers to compromise the infrastructure underlying AI operations.",
        requiredActions: [
          { action: "Configure baseline security settings and hardening policies for Claw fleet instances", configPath: "/app/claw-fleet", automated: true },
          { action: "Enable OPA policies enforcing platform configuration standards", configPath: "/app/claw-policies", automated: true },
          { action: "Document platform security baselines and configuration management procedures", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "PR.IR-01",
      framework: "nist_csf",
      title: "Technology infrastructure resilience",
      description: "Security architectures shall be managed with the organization's risk strategy to protect asset confidentiality, integrity, and availability, and organizational resilience.",
      category: "PR Protect",
      guidance: {
        learnMore: "Technology infrastructure must be designed with resilience in mind, including redundancy for critical components, capacity planning, backup and recovery capabilities, and the ability to absorb and adapt to disruptions while maintaining essential functions.",
        whyItMatters: "Infrastructure failures and denial-of-service attacks can disrupt AI services and prevent access to critical data. Resilient infrastructure ensures business continuity even when individual components fail or are under attack.",
        requiredActions: [
          { action: "Configure capacity management and auto-scaling policies for Claw fleet", configPath: "/app/concurrency", automated: true },
          { action: "Enable infrastructure health monitoring and redundancy checks", configPath: "/app/claw-fleet", automated: true },
          { action: "Document infrastructure resilience architecture, recovery time objectives, and failover procedures", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "PR.IR-02",
      framework: "nist_csf",
      title: "Resilience requirements management",
      description: "Resilience requirements shall be established to support the delivery of critical services across normal and adverse operating conditions, including disaster recovery planning.",
      category: "PR Protect",
      guidance: {
        learnMore: "Resilience requirements must define recovery time objectives (RTOs), recovery point objectives (RPOs), maximum tolerable downtime for each critical service, and the minimum level of service that must be maintained during adverse conditions. These requirements must be tested regularly.",
        whyItMatters: "Without defined resilience requirements, recovery efforts during incidents are ad hoc and often fail to restore services within acceptable timeframes. Clear requirements enable targeted investment in backup systems and recovery capabilities.",
        requiredActions: [
          { action: "Configure concurrency and capacity thresholds aligned with resilience requirements", configPath: "/app/concurrency", automated: true },
          { action: "Enable automated backup and recovery testing for Claw fleet data stores", configPath: "/app/claw-fleet", automated: true },
          { action: "Document RTOs, RPOs, and disaster recovery procedures for all critical services", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // DE — Detect
    // ═══════════════════════════════════════════════════════════════
    {
      id: "DE.CM-01",
      framework: "nist_csf",
      title: "Continuous monitoring",
      description: "Networks and network services shall be continuously monitored to detect potentially adverse cybersecurity events. Monitoring information shall be correlated from multiple sources.",
      category: "DE Detect",
      guidance: {
        learnMore: "Continuous monitoring must cover network traffic analysis, system event monitoring, application activity logging, and user behavior analytics. Monitoring data from multiple sources should be correlated to identify complex attack patterns that may not be apparent from a single data source.",
        whyItMatters: "Modern attacks are stealthy and multi-staged. Continuous monitoring with correlation enables detection of subtle indicators of compromise that point-in-time assessments miss, reducing the average time to detect breaches from months to hours.",
        requiredActions: [
          { action: "Enable continuous monitoring across all Claw fleet instances with real-time alerting", configPath: "/app/claw-fleet", automated: true },
          { action: "Configure OPA policies for behavioral anomaly detection in AI operations", configPath: "/app/claw-policies", automated: true },
          { action: "Document monitoring coverage, alert thresholds, and escalation procedures", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "DE.AE-01",
      framework: "nist_csf",
      title: "Adverse event analysis",
      description: "Anomalies, indicators of compromise, and other potentially adverse events shall be analyzed to characterize the events and detect cybersecurity incidents.",
      category: "DE Detect",
      guidance: {
        learnMore: "Adverse event analysis involves correlating alerts from multiple monitoring systems, determining if anomalies represent genuine security incidents, establishing baselines for normal behavior, and using threat intelligence to enrich analysis. This includes detecting adversarial AI inputs, model manipulation attempts, and unauthorized data access patterns.",
        whyItMatters: "Raw security alerts generate overwhelming volumes of data. Without effective analysis, critical incidents are lost in noise. Proper event analysis separates genuine threats from false positives, enabling focused and timely response.",
        requiredActions: [
          { action: "Configure event correlation and analysis rules in the compliance monitoring dashboard", configPath: "/app/compliance", automated: true },
          { action: "Enable OPA policy rules for AI-specific threat pattern detection", configPath: "/app/claw-policies", automated: true },
          { action: "Document event analysis procedures, escalation criteria, and incident classification standards", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "DE.DP-01",
      framework: "nist_csf",
      title: "Detection processes",
      description: "Detection processes and procedures shall be maintained, tested, and continually improved to ensure awareness of anomalous events, with defined roles and responsibilities for detection activities.",
      category: "DE Detect",
      guidance: {
        learnMore: "Detection processes must be documented, include defined roles and responsibilities, be tested regularly to ensure they function correctly, comply with applicable legal requirements, and be communicated to appropriate personnel. The effectiveness of detection technologies and processes must be validated periodically.",
        whyItMatters: "Detection processes that exist only on paper provide no protection. Regular testing ensures that detection mechanisms work as intended and that response teams are prepared to act on alerts when real incidents occur.",
        requiredActions: [
          { action: "Configure automated detection process validation and testing schedules", configPath: "/app/claw-fleet", automated: true },
          { action: "Enable detection effectiveness metrics in compliance reporting", configPath: "/app/compliance", automated: true },
          { action: "Document detection process procedures, testing results, and improvement plans", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "DE.SN-01",
      framework: "nist_csf",
      title: "Security notifications",
      description: "Detection information shall be communicated to appropriate parties to enable timely response. Notifications shall be triggered based on defined thresholds and criteria.",
      category: "DE Detect",
      guidance: {
        learnMore: "Security notification mechanisms must include automated alerting for critical events, defined notification channels and recipients for different event types, escalation procedures for unacknowledged alerts, and integration with incident response processes.",
        whyItMatters: "Detecting a security event is only valuable if the right people are notified in time to respond. Delayed or misdirected notifications allow incidents to escalate from minor events to major breaches.",
        requiredActions: [
          { action: "Configure security notification channels and escalation rules in platform settings", configPath: "/app/settings", automated: true },
          { action: "Enable real-time alert notifications through telephony and communication channels", configPath: "/app/telephony", automated: true },
          { action: "Document notification procedures, recipient lists, and escalation timelines", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // RS — Respond
    // ═══════════════════════════════════════════════════════════════
    {
      id: "RS.MA-01",
      framework: "nist_csf",
      title: "Incident management",
      description: "Incidents shall be managed from detection through resolution, including preparation, containment, eradication, recovery, and post-incident activities.",
      category: "RS Respond",
      guidance: {
        learnMore: "Incident management must cover the full incident lifecycle: preparation (including response plans and team readiness), detection and analysis, containment (limiting damage), eradication (removing the threat), recovery (restoring normal operations), and post-incident activities (lessons learned and process improvements).",
        whyItMatters: "Unmanaged incidents escalate rapidly. Organizations with mature incident management processes contain breaches 54% faster and at 36% lower cost than those without, according to industry studies.",
        requiredActions: [
          { action: "Configure incident response workflows with role-based assignments", configPath: "/app/roles", automated: true },
          { action: "Enable automated incident detection and initial containment through OPA policies", configPath: "/app/claw-policies", automated: true },
          { action: "Document the incident management plan including response procedures and team responsibilities", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "RS.AN-01",
      framework: "nist_csf",
      title: "Incident analysis",
      description: "Incident investigations shall be conducted to determine the root cause, scope, and impact of detected cybersecurity incidents, with findings documented and shared appropriately.",
      category: "RS Respond",
      guidance: {
        learnMore: "Incident analysis must determine how the incident occurred, what systems and data were affected, what data may have been compromised, the timeline of the attack, and whether the incident is ongoing. Forensic evidence must be preserved according to legal requirements.",
        whyItMatters: "Incomplete incident analysis leads to inadequate remediation — if the root cause is not identified, the same vulnerability will be exploited again. Thorough analysis also supports legal proceedings and regulatory notifications.",
        requiredActions: [
          { action: "Enable detailed audit log preservation for forensic analysis during incidents", configPath: "/app/compliance", automated: true },
          { action: "Configure Claw fleet diagnostic tools for incident scope assessment", configPath: "/app/claw-fleet", automated: true },
          { action: "Document incident analysis procedures including evidence preservation and root cause methodology", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "RS.CO-01",
      framework: "nist_csf",
      title: "Incident communication",
      description: "Response activities shall be coordinated with internal and external stakeholders as appropriate, including law enforcement agencies, regulators, and affected parties.",
      category: "RS Respond",
      guidance: {
        learnMore: "Incident communication must include notifying internal stakeholders (management, legal, affected teams), external stakeholders (customers, partners, regulators), and law enforcement when appropriate. Communication must be timely, accurate, and comply with regulatory notification requirements.",
        whyItMatters: "Poor communication during incidents erodes trust and can violate regulatory notification requirements. Organizations that communicate transparently and promptly during incidents maintain stakeholder confidence and avoid regulatory penalties.",
        requiredActions: [
          { action: "Configure incident notification templates and distribution lists in communication settings", configPath: "/app/telephony", automated: true },
          { action: "Enable automated stakeholder notification workflows for different incident severity levels", configPath: "/app/settings", automated: true },
          { action: "Document incident communication plan including regulatory notification timelines and templates", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "RS.MI-01",
      framework: "nist_csf",
      title: "Incident mitigation",
      description: "Activities shall be performed to prevent expansion of an event and mitigate its effects, including containment actions and removal of the conditions that allowed the incident.",
      category: "RS Respond",
      guidance: {
        learnMore: "Incident mitigation includes isolating affected systems, blocking attack vectors, patching exploited vulnerabilities, removing unauthorized access, restoring systems from clean backups, and implementing additional controls to prevent recurrence. Mitigation actions must be documented and tested before implementation in production.",
        whyItMatters: "Rapid mitigation limits the blast radius of security incidents. Every hour an incident remains unmitigated increases the volume of compromised data and the cost of recovery, often exponentially.",
        requiredActions: [
          { action: "Configure automated containment policies in OPA to isolate compromised Claw instances", configPath: "/app/claw-policies", automated: true },
          { action: "Enable emergency shutdown and isolation capabilities in Claw fleet management", configPath: "/app/claw-fleet", automated: true },
          { action: "Document incident containment and mitigation playbooks for common incident types", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // RC — Recover
    // ═══════════════════════════════════════════════════════════════
    {
      id: "RC.RP-01",
      framework: "nist_csf",
      title: "Recovery planning",
      description: "Recovery plans shall be executed during or after a cybersecurity incident to restore systems, capabilities, and services that were impaired. Recovery activities shall be prioritized based on business impact.",
      category: "RC Recover",
      guidance: {
        learnMore: "Recovery planning must define the order in which systems and services are restored based on business priority, include detailed restoration procedures for each critical system, define success criteria for recovery, and account for dependencies between systems during the recovery sequence.",
        whyItMatters: "Without a recovery plan, restoration after an incident is chaotic and slow. Planned recovery ensures that the most critical services are restored first, minimizing business impact and maintaining stakeholder confidence.",
        requiredActions: [
          { action: "Configure system priority levels and recovery sequences in Claw fleet management", configPath: "/app/claw-fleet", automated: true },
          { action: "Enable automated backup verification and recovery testing", configPath: "/app/settings", automated: true },
          { action: "Document recovery plans with prioritized restoration sequences and success criteria", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "RC.IM-01",
      framework: "nist_csf",
      title: "Recovery improvements",
      description: "Recovery planning and processes shall be improved by incorporating lessons learned into future activities, updating plans based on actual recovery experience.",
      category: "RC Recover",
      guidance: {
        learnMore: "After each incident requiring recovery actions, a post-incident review must assess the effectiveness of recovery procedures, identify gaps in recovery plans, update procedures based on lessons learned, and improve recovery time through process optimization and automation.",
        whyItMatters: "Recovery processes that are never tested or improved degrade over time as systems change. Incorporating lessons learned from actual incidents ensures recovery plans remain realistic and effective.",
        requiredActions: [
          { action: "Configure post-incident review workflows with automated follow-up tracking", configPath: "/app/compliance", automated: true },
          { action: "Enable recovery metrics tracking and trend analysis in fleet monitoring", configPath: "/app/claw-fleet", automated: true },
          { action: "Document lessons learned from each recovery event and resulting plan updates", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "RC.CO-01",
      framework: "nist_csf",
      title: "Recovery communications",
      description: "Restoration activities shall be coordinated with internal and external parties, including coordinating centers, internet service providers, attacking system owners, victims, other CSIRTs, and vendors.",
      category: "RC Recover",
      guidance: {
        learnMore: "Recovery communications must keep all stakeholders informed of restoration progress, manage expectations regarding recovery timelines, coordinate with third-party service providers involved in recovery, and provide regular updates to affected customers and regulatory bodies until normal operations resume.",
        whyItMatters: "Stakeholders who are kept informed during recovery maintain confidence in the organization's ability to manage the situation. Poor communication during recovery can cause greater reputational damage than the incident itself.",
        requiredActions: [
          { action: "Configure recovery status notification channels and update schedules", configPath: "/app/telephony", automated: true },
          { action: "Enable stakeholder communication tracking during recovery activities", configPath: "/app/teams", automated: true },
          { action: "Document recovery communication procedures, stakeholder contact lists, and update templates", configPath: "/app/compliance", automated: false },
        ],
      },
    },
  ];
}

// ══════════════════════════════════════════════════════════════════════
// FedRAMP Moderate Baseline Controls
// ══════════════════════════════════════════════════════════════════════

export function getFedrampControls(): Omit<ControlDefinition, "status" | "evidence">[] {
  return [
    // ═══════════════════════════════════════════════════════════════
    // AC — Access Control
    // ═══════════════════════════════════════════════════════════════
    {
      id: "AC-1",
      framework: "fedramp",
      title: "Access control policy and procedures",
      description: "The organization shall develop, document, disseminate, and review/update an access control policy that addresses purpose, scope, roles, responsibilities, management commitment, coordination, and compliance, along with procedures to facilitate implementation.",
      category: "AC Access Control",
      guidance: {
        learnMore: "The access control policy must define who can access what systems and data, under what conditions access is granted, how access rights are managed throughout the user lifecycle, and how the policy is enforced. Procedures must be reviewed and updated at least annually or when significant changes occur.",
        whyItMatters: "FedRAMP requires formal access control policies as the foundation for protecting federal information. Without documented policies, access decisions are inconsistent and cannot be audited, creating risks for federal data processed in cloud environments.",
        requiredActions: [
          { action: "Document access control policy covering purpose, scope, roles, and compliance requirements", configPath: "/app/compliance", automated: false },
          { action: "Implement access control procedures using RBAC role definitions", configPath: "/app/roles", automated: true },
          { action: "Configure OPA policies enforcing documented access control rules", configPath: "/app/claw-policies", automated: true },
        ],
      },
    },
    {
      id: "AC-2",
      framework: "fedramp",
      title: "Account management",
      description: "The organization shall manage information system accounts including identifying account types, establishing conditions for group membership, identifying authorized users, specifying access privileges, requiring management approval, and monitoring account usage.",
      category: "AC Access Control",
      guidance: {
        learnMore: "Account management must cover the full account lifecycle: creation with management approval, modification with documented justification, periodic review (at least annually), disabling inactive accounts after 90 days, and prompt removal when users depart. All account actions must be auditable.",
        whyItMatters: "Unmanaged accounts are a primary attack vector in federal information systems. Orphaned accounts, over-privileged users, and accounts without regular review create persistent vulnerabilities that adversaries exploit for lateral movement.",
        requiredActions: [
          { action: "Configure comprehensive account lifecycle management in RBAC settings", configPath: "/app/roles", automated: true },
          { action: "Enable automated account usage monitoring and inactive account alerting", configPath: "/app/compliance", automated: true },
          { action: "Document account management procedures including approval workflows and review schedules", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "AC-3",
      framework: "fedramp",
      title: "Access enforcement",
      description: "The information system shall enforce approved authorizations for logical access to information and system resources in accordance with applicable access control policies.",
      category: "AC Access Control",
      guidance: {
        learnMore: "Access enforcement mechanisms must be implemented at the system level to ensure that only authorized users can access protected resources. This includes enforcing role-based access control, attribute-based access control, and mandatory access control as appropriate for the sensitivity of the data.",
        whyItMatters: "Access policies that are not technically enforced are merely advisory. FedRAMP requires that access restrictions are implemented in the system architecture so that policy violations are prevented rather than merely detected after the fact.",
        requiredActions: [
          { action: "Configure OPA policies for real-time access enforcement on all API endpoints", configPath: "/app/claw-policies", automated: true },
          { action: "Enable RBAC enforcement with deny-by-default for all Claw data access operations", configPath: "/app/roles", automated: true },
          { action: "Document access enforcement mechanisms and verify they align with the access control policy", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "AC-4",
      framework: "fedramp",
      title: "Information flow enforcement",
      description: "The information system shall enforce approved authorizations for controlling the flow of information within the system and between connected systems based on applicable policy.",
      category: "AC Access Control",
      guidance: {
        learnMore: "Information flow enforcement controls how data moves between security domains, network segments, and systems. This includes controlling data flows between different classification levels, preventing unauthorized data exfiltration, and ensuring that data is only transmitted to authorized destinations.",
        whyItMatters: "Uncontrolled information flow allows sensitive federal data to move to unauthorized locations, including lower-security environments, unauthorized third parties, or external systems not authorized to process federal information.",
        requiredActions: [
          { action: "Configure OPA data flow policies controlling information movement between Claw instances", configPath: "/app/claw-policies", automated: true },
          { action: "Enable data classification-based flow controls in Copilot query routing", configPath: "/app/copilot", automated: true },
          { action: "Document approved information flow paths and enforcement mechanisms", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "AC-5",
      framework: "fedramp",
      title: "Separation of duties",
      description: "The organization shall separate duties of individuals to reduce the risk of malicious activity without collusion. The information system shall enforce separation of duties through assigned access authorizations.",
      category: "AC Access Control",
      guidance: {
        learnMore: "Separation of duties must ensure that no single individual can control all critical aspects of a process or system operation. Examples include separating system administration from audit function, development from production operations, and policy creation from policy approval.",
        whyItMatters: "Without separation of duties, a single compromised or malicious user account can authorize, execute, and conceal high-impact actions. This is particularly critical in federal systems where insider threats must be mitigated through structural controls.",
        requiredActions: [
          { action: "Configure RBAC roles with enforced separation between administrative functions", configPath: "/app/roles", automated: true },
          { action: "Define OPA policies preventing single users from performing conflicting operations", configPath: "/app/claw-policies", automated: true },
          { action: "Document separation of duties matrix mapping roles to incompatible functions", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "AC-6",
      framework: "fedramp",
      title: "Least privilege",
      description: "The organization shall employ the principle of least privilege, allowing only authorized accesses that are necessary for users to accomplish assigned tasks in accordance with organizational missions and business functions.",
      category: "AC Access Control",
      guidance: {
        learnMore: "Least privilege requires that each user, process, and system component operates with the minimum set of privileges necessary. This includes restricting privileged accounts to only those functions requiring elevation, auditing the use of privileged functions, and preventing privileged users from performing non-privileged functions using privileged accounts.",
        whyItMatters: "Over-privileged accounts amplify the impact of any security breach. When a user account with excessive privileges is compromised, the attacker gains access far beyond what was necessary for the user's actual job function, greatly increasing potential damage to federal data.",
        requiredActions: [
          { action: "Configure minimum-privilege role templates for all standard user types", configPath: "/app/roles", automated: true },
          { action: "Enable OPA policies auditing and restricting privilege escalation attempts", configPath: "/app/claw-policies", automated: true },
          { action: "Document least privilege implementation and conduct periodic access reviews", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // AU — Audit and Accountability
    // ═══════════════════════════════════════════════════════════════
    {
      id: "AU-1",
      framework: "fedramp",
      title: "Audit and accountability policy and procedures",
      description: "The organization shall develop, document, disseminate, and review/update audit and accountability policy and procedures that address purpose, scope, roles, responsibilities, management commitment, coordination, and compliance.",
      category: "AU Audit",
      guidance: {
        learnMore: "The audit policy must define what events are auditable, how audit records are generated, protected, and retained, who is responsible for audit review and analysis, and how audit findings are reported and acted upon. The policy must be reviewed and updated at least annually.",
        whyItMatters: "FedRAMP requires comprehensive audit capabilities to maintain accountability for all actions taken on federal information. Without formal audit policies, organizations cannot demonstrate compliance or investigate security incidents affecting federal data.",
        requiredActions: [
          { action: "Document audit and accountability policy covering all FedRAMP audit requirements", configPath: "/app/compliance", automated: false },
          { action: "Configure comprehensive audit logging across all platform components", configPath: "/app/compliance", automated: true },
          { action: "Assign audit review responsibilities to designated roles", configPath: "/app/roles", automated: true },
        ],
      },
    },
    {
      id: "AU-2",
      framework: "fedramp",
      title: "Audit events",
      description: "The organization shall determine that the information system is capable of auditing specific events including successful and unsuccessful login attempts, privilege changes, data access, and system administration activities.",
      category: "AU Audit",
      guidance: {
        learnMore: "Auditable events must include user login and logout, failed authentication attempts, privilege escalation, changes to security settings, access to sensitive data, system administration commands, and application-specific events. The list of auditable events must be reviewed and updated annually.",
        whyItMatters: "Incomplete audit event coverage creates blind spots in security monitoring. If critical events like privilege changes or data access are not logged, security incidents involving federal data cannot be properly detected or investigated.",
        requiredActions: [
          { action: "Configure audit event capture for all security-relevant operations in OPA policies", configPath: "/app/claw-policies", automated: true },
          { action: "Enable comprehensive event logging for authentication, authorization, and data access events", configPath: "/app/compliance", automated: true },
          { action: "Document the auditable events list with rationale and annual review schedule", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "AU-3",
      framework: "fedramp",
      title: "Content of audit records",
      description: "The information system shall generate audit records containing information that establishes what type of event occurred, when it occurred, where it occurred, the source, the outcome, and the identity of individuals or subjects associated with the event.",
      category: "AU Audit",
      guidance: {
        learnMore: "Each audit record must include the event type, timestamp, component or location, event source, event outcome (success or failure), and user identity. Additional detail may include command parameters, data objects accessed, and the network address of the source.",
        whyItMatters: "Audit records without sufficient detail cannot support security investigations or compliance audits. Records must contain enough information to reconstruct events, identify responsible parties, and determine the scope of any security incident.",
        requiredActions: [
          { action: "Configure audit record format to include all required FedRAMP fields", configPath: "/app/settings", automated: true },
          { action: "Enable enriched audit logging with user identity, source IP, and outcome for all Claw operations", configPath: "/app/claw-policies", automated: true },
          { action: "Verify and document that audit record content meets FedRAMP requirements", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "AU-4",
      framework: "fedramp",
      title: "Audit storage capacity",
      description: "The organization shall allocate audit record storage capacity in accordance with audit record storage requirements, and configure the system to alert appropriate personnel when allocated storage volume reaches a defined threshold.",
      category: "AU Audit",
      guidance: {
        learnMore: "Audit log storage must be sufficient to retain records for the required period (typically 1 year online, 3 years archived for FedRAMP Moderate). Storage capacity must be monitored, and alerts must trigger when a defined threshold (e.g., 80% capacity) is reached to prevent audit log loss.",
        whyItMatters: "If audit storage is exhausted, new events are no longer recorded, creating gaps in the audit trail. These gaps can be exploited by attackers and make it impossible to demonstrate compliance during FedRAMP assessments.",
        requiredActions: [
          { action: "Configure audit log storage capacity monitoring and threshold alerts", configPath: "/app/settings", automated: true },
          { action: "Enable Claw fleet storage monitoring for audit log partitions", configPath: "/app/claw-fleet", automated: true },
          { action: "Document audit storage capacity planning and retention policies", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "AU-6",
      framework: "fedramp",
      title: "Audit review, analysis, and reporting",
      description: "The organization shall review and analyze information system audit records at least weekly for indications of inappropriate or unusual activity, and report findings to designated organizational officials.",
      category: "AU Audit",
      guidance: {
        learnMore: "Audit review must occur at least weekly for FedRAMP Moderate, with automated tools analyzing records for anomalies, policy violations, and indicators of compromise. Findings must be reported to the information system security officer (ISSO) and other designated officials. The review process must be documented and its outputs retained.",
        whyItMatters: "Audit records that are collected but never reviewed provide no security benefit. Regular analysis transforms raw log data into actionable intelligence, enabling timely detection of threats to federal information processed in the cloud environment.",
        requiredActions: [
          { action: "Configure automated weekly audit review and anomaly detection reports", configPath: "/app/compliance", automated: true },
          { action: "Enable OPA-based policy violation detection and automated finding reports", configPath: "/app/claw-policies", automated: true },
          { action: "Document audit review procedures, responsible officials, and reporting formats", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // CM — Configuration Management
    // ═══════════════════════════════════════════════════════════════
    {
      id: "CM-1",
      framework: "fedramp",
      title: "Configuration management policy and procedures",
      description: "The organization shall develop, document, disseminate, and review/update a configuration management policy that addresses purpose, scope, roles, responsibilities, management commitment, coordination, and compliance.",
      category: "CM Configuration Management",
      guidance: {
        learnMore: "The configuration management policy must define how system configurations are established, documented, implemented, and maintained. It must cover baseline configuration management, change control processes, configuration monitoring, and deviation handling procedures.",
        whyItMatters: "Uncontrolled configuration changes are a leading cause of security vulnerabilities in cloud environments. Without formal configuration management, security settings drift from approved baselines, creating exploitable weaknesses in systems processing federal data.",
        requiredActions: [
          { action: "Document configuration management policy covering all FedRAMP CM requirements", configPath: "/app/compliance", automated: false },
          { action: "Configure OPA policies enforcing configuration management standards", configPath: "/app/claw-policies", automated: true },
          { action: "Assign configuration management responsibilities to designated roles", configPath: "/app/roles", automated: true },
        ],
      },
    },
    {
      id: "CM-2",
      framework: "fedramp",
      title: "Baseline configuration",
      description: "The organization shall develop, document, and maintain a current baseline configuration of the information system, including hardware, software, firmware, and documentation.",
      category: "CM Configuration Management",
      guidance: {
        learnMore: "Baseline configurations must include a documented set of specifications for each system component, security settings appropriate for the component's role, approved software and version information, and network topology diagrams. Baselines must be reviewed and updated at least annually and when significant changes occur.",
        whyItMatters: "Without a defined baseline, there is no standard against which to measure configuration drift. Baseline configurations enable detection of unauthorized changes, rapid restoration after incidents, and consistent security across all system components.",
        requiredActions: [
          { action: "Configure baseline Claw fleet settings and capture approved configuration snapshots", configPath: "/app/claw-fleet", automated: true },
          { action: "Define OPA policy baselines for all security-relevant configuration parameters", configPath: "/app/claw-policies", automated: true },
          { action: "Document baseline configurations for all system components with version information", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CM-3",
      framework: "fedramp",
      title: "Configuration change control",
      description: "The organization shall determine the types of changes to the information system that are configuration-controlled, approve changes with explicit security impact analysis, and maintain an audit trail of all changes.",
      category: "CM Configuration Management",
      guidance: {
        learnMore: "Change control must include requesting, analyzing, approving, implementing, testing, and documenting changes. All changes must undergo a security impact analysis before implementation. Emergency changes must be documented and reviewed after implementation. A complete audit trail of all configuration changes must be maintained.",
        whyItMatters: "Uncontrolled changes to systems processing federal data can introduce vulnerabilities, disrupt services, or create compliance gaps. Formal change control ensures every modification is assessed for security impact and can be rolled back if problems occur.",
        requiredActions: [
          { action: "Enable audit logging for all configuration changes across Claw policies and fleet", configPath: "/app/claw-policies", automated: true },
          { action: "Configure approval workflows for configuration changes requiring role-based sign-off", configPath: "/app/roles", automated: true },
          { action: "Document change control procedures including security impact analysis templates", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CM-4",
      framework: "fedramp",
      title: "Security impact analysis",
      description: "The organization shall analyze changes to the information system to determine potential security impacts prior to change implementation, considering how the changes affect the security posture.",
      category: "CM Configuration Management",
      guidance: {
        learnMore: "Security impact analysis must be performed before implementing any change to the information system. The analysis must consider the impact on existing security controls, the introduction of new vulnerabilities, the effect on the system's authorization status, and whether additional security controls are needed.",
        whyItMatters: "Changes that appear benign from a functional perspective may have significant security implications. A security impact analysis catches these issues before they reach production, preventing costly post-deployment remediation or security incidents.",
        requiredActions: [
          { action: "Configure pre-deployment security analysis checks in Claw fleet deployment pipeline", configPath: "/app/claw-fleet", automated: true },
          { action: "Enable OPA policy impact simulation for proposed configuration changes", configPath: "/app/claw-policies", automated: true },
          { action: "Document security impact analysis procedures and maintain analysis records", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CM-7",
      framework: "fedramp",
      title: "Least functionality",
      description: "The organization shall configure the information system to provide only essential capabilities and shall restrict the use of unnecessary functions, ports, protocols, and services.",
      category: "CM Configuration Management",
      guidance: {
        learnMore: "Systems must be configured with only the functions, ports, protocols, and services necessary for their designated purpose. Unnecessary software must be removed, unused services disabled, and non-essential ports blocked. The list of enabled functions must be reviewed regularly and updated as requirements change.",
        whyItMatters: "Every enabled function, open port, and running service represents a potential attack surface. Reducing the system to its minimum necessary functionality dramatically reduces the number of potential vulnerabilities an attacker can exploit.",
        requiredActions: [
          { action: "Configure Claw fleet instances with minimal required services and disabled unnecessary features", configPath: "/app/claw-fleet", automated: true },
          { action: "Define OPA policies enforcing least functionality requirements on all deployments", configPath: "/app/claw-policies", automated: true },
          { action: "Document approved function lists and conduct periodic reviews of enabled services", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // IR — Incident Response
    // ═══════════════════════════════════════════════════════════════
    {
      id: "IR-1",
      framework: "fedramp",
      title: "Incident response policy and procedures",
      description: "The organization shall develop, document, disseminate, and review/update an incident response policy that addresses purpose, scope, roles, responsibilities, management commitment, coordination, and compliance, along with procedures for implementation.",
      category: "IR Incident Response",
      guidance: {
        learnMore: "The incident response policy must define the organization's approach to preparing for, detecting, analyzing, containing, eradicating, and recovering from security incidents. It must identify incident response team members, define reporting chains, establish communication procedures, and specify requirements for post-incident activities.",
        whyItMatters: "FedRAMP requires CSPs to report incidents affecting federal data within specific timeframes. Without documented incident response procedures, organizations cannot consistently meet these requirements, risking authorization revocation and legal liability.",
        requiredActions: [
          { action: "Document incident response policy covering all FedRAMP IR requirements", configPath: "/app/compliance", automated: false },
          { action: "Configure incident response roles and escalation paths in RBAC settings", configPath: "/app/roles", automated: true },
          { action: "Define OPA policies for automated initial incident classification", configPath: "/app/claw-policies", automated: true },
        ],
      },
    },
    {
      id: "IR-4",
      framework: "fedramp",
      title: "Incident handling",
      description: "The organization shall implement an incident handling capability including preparation, detection and analysis, containment, eradication, and recovery, with coordination of incident handling activities with contingency planning.",
      category: "IR Incident Response",
      guidance: {
        learnMore: "Incident handling must integrate with the organization's contingency planning, include automated mechanisms to support the incident handling process, incorporate lessons learned from ongoing incident handling activities, and update incident response procedures accordingly. For FedRAMP, US-CERT must be notified within one hour of confirmed incidents.",
        whyItMatters: "Effective incident handling minimizes the impact of security incidents on federal data. Organizations that can rapidly detect, contain, and eradicate threats protect federal information from prolonged exposure and limit recovery costs.",
        requiredActions: [
          { action: "Configure automated incident detection and initial containment through OPA policies", configPath: "/app/claw-policies", automated: true },
          { action: "Enable incident tracking and lifecycle management in compliance dashboards", configPath: "/app/compliance", automated: true },
          { action: "Document incident handling procedures including US-CERT notification requirements", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "IR-5",
      framework: "fedramp",
      title: "Incident monitoring",
      description: "The organization shall track and document information system security incidents, maintaining records of incidents from initial detection through final disposition.",
      category: "IR Incident Response",
      guidance: {
        learnMore: "Incident monitoring must track each incident through its complete lifecycle, maintain a centralized incident database, record all actions taken during the response, and preserve evidence for potential legal proceedings. Metrics such as mean time to detect, respond, and recover must be tracked.",
        whyItMatters: "FedRAMP assessors review incident records to evaluate the organization's security posture and response capabilities. Incomplete incident tracking undermines the organization's ability to demonstrate continuous monitoring and effective incident management.",
        requiredActions: [
          { action: "Enable comprehensive incident tracking and status monitoring in the compliance dashboard", configPath: "/app/compliance", automated: true },
          { action: "Configure Claw fleet monitoring to feed incident detection data into the tracking system", configPath: "/app/claw-fleet", automated: true },
          { action: "Document incident monitoring procedures and define reporting metrics", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "IR-6",
      framework: "fedramp",
      title: "Incident reporting",
      description: "The organization shall require personnel to report suspected security incidents to the organizational incident response capability within defined timeframes, and report incidents to appropriate external authorities.",
      category: "IR Incident Response",
      guidance: {
        learnMore: "Internal incident reporting must occur within defined timeframes based on incident severity. For FedRAMP, confirmed incidents must be reported to US-CERT within one hour. The organization must also report to the FedRAMP PMO, the authorizing official, and any affected agencies. Weaknesses and vulnerabilities that could lead to incidents must also be reported.",
        whyItMatters: "Delayed incident reporting allows incidents to escalate and prevents federal agencies from taking protective action. FedRAMP's strict reporting timelines exist to ensure that federal data exposure is minimized and coordinated response is possible.",
        requiredActions: [
          { action: "Configure automated incident severity classification and notification routing", configPath: "/app/settings", automated: true },
          { action: "Enable real-time incident alert distribution to designated response personnel", configPath: "/app/telephony", automated: true },
          { action: "Document incident reporting procedures, timelines, and external reporting contacts (US-CERT, FedRAMP PMO)", configPath: "/app/compliance", automated: false },
        ],
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // CA — Security Assessment
    // ═══════════════════════════════════════════════════════════════
    {
      id: "CA-1",
      framework: "fedramp",
      title: "Security assessment policy and procedures",
      description: "The organization shall develop, document, disseminate, and review/update a security assessment and authorization policy that addresses purpose, scope, roles, responsibilities, management commitment, coordination, and compliance.",
      category: "CA Security Assessment",
      guidance: {
        learnMore: "The security assessment policy must define the organization's approach to assessing security controls, authorizing system operation, and monitoring security control effectiveness. It must cover assessment planning, execution, reporting, and remediation, including the roles of independent assessors and the FedRAMP PMO.",
        whyItMatters: "Security assessments are the primary mechanism for verifying that FedRAMP controls are implemented effectively. Without formal assessment policies, organizations cannot achieve or maintain FedRAMP authorization, preventing them from processing federal data.",
        requiredActions: [
          { action: "Document security assessment policy covering FedRAMP 3PAO requirements", configPath: "/app/compliance", automated: false },
          { action: "Configure compliance assessment workflows and evidence collection automation", configPath: "/app/compliance", automated: true },
          { action: "Assign assessment coordination responsibilities to designated roles", configPath: "/app/roles", automated: true },
        ],
      },
    },
    {
      id: "CA-2",
      framework: "fedramp",
      title: "Security assessments",
      description: "The organization shall develop a security assessment plan, assess security controls annually, produce a security assessment report, and provide the results to designated officials.",
      category: "CA Security Assessment",
      guidance: {
        learnMore: "Security assessments must be conducted by an independent FedRAMP-accredited Third Party Assessment Organization (3PAO). The assessment plan must identify the controls to be assessed, assessment procedures, and assessment team. The security assessment report must document findings, recommendations, and plans for remediation.",
        whyItMatters: "Annual security assessments by independent 3PAOs are a cornerstone of FedRAMP continuous monitoring. These assessments provide objective verification that controls are operational and effective, which is essential for maintaining authorization to operate.",
        requiredActions: [
          { action: "Enable automated security control evidence collection for assessment preparation", configPath: "/app/compliance", automated: true },
          { action: "Configure OPA policy effectiveness reporting to support assessment activities", configPath: "/app/claw-policies", automated: true },
          { action: "Document the security assessment plan and coordinate with 3PAO for annual assessment", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CA-3",
      framework: "fedramp",
      title: "System interconnections",
      description: "The organization shall authorize connections from the information system to other information systems through the use of Interconnection Security Agreements, and monitor the connections on an ongoing basis.",
      category: "CA Security Assessment",
      guidance: {
        learnMore: "Every connection between the cloud system and external systems must be documented and authorized through an Interconnection Security Agreement (ISA) or Memorandum of Understanding (MOU). The ISA must describe the interface characteristics, security requirements, and the nature of information communicated. Connections must be monitored for unauthorized activity.",
        whyItMatters: "Unauthorized or poorly secured system interconnections create pathways for data leakage and attacks. FedRAMP requires explicit authorization of all connections to ensure that federal data only flows through approved and monitored channels.",
        requiredActions: [
          { action: "Maintain an inventory of all external system connections and API integrations in Claw fleet", configPath: "/app/claw-fleet", automated: true },
          { action: "Configure OPA policies governing data exchange with external systems", configPath: "/app/claw-policies", automated: true },
          { action: "Document Interconnection Security Agreements for all external system connections", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CA-5",
      framework: "fedramp",
      title: "Plan of action and milestones",
      description: "The organization shall develop a plan of action and milestones (POA&M) for the information system to document planned remedial actions to correct weaknesses or deficiencies identified during security assessments.",
      category: "CA Security Assessment",
      guidance: {
        learnMore: "The POA&M must document each identified weakness or deficiency, planned corrective actions, responsible parties, expected completion dates, milestones with progress dates, and the current status. High-risk items must have planned remediation within 30 days, moderate within 90 days, and low within 180 days. The POA&M must be updated at least monthly.",
        whyItMatters: "The POA&M is a critical FedRAMP artifact that demonstrates the organization's commitment to remediation. An outdated or incomplete POA&M signals to assessors and authorizing officials that the organization is not actively managing its security posture.",
        requiredActions: [
          { action: "Configure POA&M tracking and milestone management in compliance dashboards", configPath: "/app/compliance", automated: true },
          { action: "Enable automated remediation status tracking linked to Claw fleet health metrics", configPath: "/app/claw-fleet", automated: true },
          { action: "Maintain and update POA&M monthly with current remediation status and milestone progress", configPath: "/app/compliance", automated: false },
        ],
      },
    },
    {
      id: "CA-7",
      framework: "fedramp",
      title: "Continuous monitoring",
      description: "The organization shall develop a continuous monitoring strategy and implement a continuous monitoring program that includes ongoing assessment of security controls, ongoing awareness of vulnerabilities and threats, and ongoing authorization decisions.",
      category: "CA Security Assessment",
      guidance: {
        learnMore: "FedRAMP continuous monitoring requires monthly vulnerability scanning, annual 3PAO assessments, monthly POA&M updates, annual control assessments (at least one-third of controls annually), incident reporting within defined timeframes, and significant change reporting. The continuous monitoring strategy must define metrics, frequencies, and assessment procedures.",
        whyItMatters: "FedRAMP authorization is not a one-time event but requires ongoing demonstration of security control effectiveness. Continuous monitoring ensures that security posture is maintained over time and that emerging threats and vulnerabilities are addressed promptly.",
        requiredActions: [
          { action: "Configure automated continuous monitoring dashboards with FedRAMP-required metrics", configPath: "/app/compliance", automated: true },
          { action: "Enable continuous security control assessment through OPA policy monitoring", configPath: "/app/claw-policies", automated: true },
          { action: "Document the continuous monitoring strategy including metrics, frequencies, and reporting procedures", configPath: "/app/compliance", automated: false },
        ],
      },
    },
  ];
}
