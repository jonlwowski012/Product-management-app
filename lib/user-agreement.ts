// Keep accepted wording unchanged; publish substantive revisions with a new version.
export const AGREEMENT_VERSION = "2026-11-10";
export const AGREEMENT_ACCEPTANCE =
  "I agree to the User Agreement and acknowledge the Privacy and data handling notice. I am at least 18 and authorized to enter this agreement.";

export function userAgreement() {
  return {
    version: AGREEMENT_VERSION,
    title: "User Agreement",
    operator: process.env.LEGAL_OPERATOR_NAME || "Jonathan Lwowski",
    contact: process.env.SUPPORT_EMAIL || "jonathan.lwowski@gmail.com",
    acceptance: AGREEMENT_ACCEPTANCE,
    sections: [
      {
        title: "1. Your agreement with the operator",
        paragraphs: [
          "This agreement governs your account and use of Evidence, including its website, software, analysis, and related services (the Service). The operator identified on this page is referred to as we, us, or our. By checking the acceptance box and creating an account, you agree to these terms. If you do not agree, do not create an account or use the Service.",
          "You must be at least 18 and legally able to enter a contract. If you act for an organization, you represent that you have authority to bind it; you and your mean that organization. You must provide accurate account information, protect your password and provider credentials, and promptly report suspected unauthorized use. Each workspace is for one account owner; do not share login credentials.",
        ],
      },
      {
        title: "2. Your material and permission to process it",
        paragraphs: [
          "You retain your rights in uploaded material and, as between you and us and to the extent such rights exist, your analysis outputs. You grant us and the service providers we use a nonexclusive license to host, copy, transmit, process, transform, and display that material solely as needed to provide, secure, support, and maintain the Service, comply with law, and carry out the retention and deletion practices described in our Privacy and data handling notice. We do not sell your uploaded material or use it to train our own models.",
          "You represent that you have all necessary rights, permissions, lawful bases, and notices for uploading material and sending it to your selected AI provider. This includes consent for recordings and transcripts, permission to disclose confidential information, and compliance with privacy, employment, intellectual property, and contractual obligations. Remove information that is unnecessary for analysis. Do not upload payment-card data, passwords, government identification numbers, protected health information, or other regulated data requiring safeguards or agreements we have not expressly agreed in writing to provide.",
          "You are responsible for your inputs, instructions, use of outputs, and independent backups. The Service is not an archival or backup service. We may remove or restrict material when reasonably necessary to address suspected infringement, unlawful activity, security risks, or violations of this agreement.",
        ],
      },
      {
        title: "3. AI limitations and your decisions",
        paragraphs: [
          "AI can produce inaccurate, incomplete, misleading, biased, or fabricated results. Extraction can omit material, assign the wrong customer, misinterpret quotations, or fail entirely. A matched quote is not verification of identity, truth, demand, or context. Results may not be unique, and other users may receive similar output. No accuracy, originality, noninfringement, customer demand, revenue, or business outcome is guaranteed.",
          "You must review original sources, coverage warnings, and conclusions before relying on, sharing, or acting on output. You remain responsible for product, investment, employment, and other decisions. The Service does not provide legal, financial, medical, or other professional advice and must not be used as the sole basis for decisions affecting a person's rights or safety or for safety-critical systems.",
        ],
      },
      {
        title: "4. Connected providers and third parties",
        paragraphs: [
          "Bringing your own API key does not mean local-only processing. Our servers decrypt saved credentials and send relevant source text and prompts to your selected provider to perform your requests. Your provider's terms, privacy practices, retention, training settings, availability, and charges apply separately. You are responsible for choosing appropriate provider settings and securing permission to use the key. Do not connect a key you are not authorized to use.",
          "You pay provider charges directly, including charges for requests that fail, are retried, or produce unusable results. Set budgets and restrictions with your provider. We do not resell API credits or guarantee provider compatibility, performance, pricing, or continued availability. To the extent permitted by law, we are not responsible for independent third-party acts or omissions; this does not exclude duties imposed on us by law.",
        ],
      },
      {
        title: "5. Subscription, renewal, cancellation, and promotions",
        paragraphs: [
          "The standard subscription is $10 USD per month, plus applicable taxes disclosed at checkout, with no free trial. Creating an account alone does not authorize a charge. When you subscribe through checkout, you authorize recurring charges at the disclosed price until cancellation. AI provider fees are separate. Storage and processing limits are described on the pricing page; reaching a limit does not create an automatic overage charge.",
          "Cancel through Settings before renewal to stop future subscription charges. Cancellation preserves access through the current subscription period. Payment failures do not extend paid access. Except where applicable law requires otherwise, fees already paid are nonrefundable and unused periods are not prorated. Contact support about billing errors or refund requests; discretionary refunds do not create an ongoing obligation. We will give advance notice of price changes for future renewals so you can cancel before a change takes effect.",
          "Promotions apply only as offered and do not cover separate provider charges. FIRST10 gives the first 10 eligible first-time customers who successfully redeem it 100% off the Evidence subscription for the lifetime of that continuous subscription. It has no cash value, is not transferable between accounts, and does not carry over to a new subscription after cancellation or termination. Lifetime describes the subscription, not a promise that Evidence will operate indefinitely. We may reject fraudulent or abusive redemptions, but will honor validly redeemed discounts while the qualifying subscription continues.",
        ],
      },
      {
        title: "6. Acceptable use and our intellectual property",
        paragraphs: [
          "We grant you a limited, nonexclusive, nontransferable right to use the Service for lawful internal purposes while you comply with this agreement. We retain all rights in the Service, software, design, and branding, excluding your material. No other rights are granted by implication.",
          "Do not break the law, infringe rights, impersonate others, upload malware, probe or bypass access controls, access another user's data, circumvent payment or usage limits, disrupt the Service, or resell access without written permission. Do not reverse engineer the Service except where law expressly permits it. These terms do not prohibit honest reviews, legally protected disclosures, or reports to regulators.",
        ],
      },
      {
        title: "7. Availability, suspension, and termination",
        paragraphs: [
          "We may change features and limits, perform maintenance, or discontinue the Service. We do not promise uninterrupted access, response times, compatibility, or an uptime service level. We will provide reasonable advance notice of material reductions or discontinuation where practicable and honor any refund or other remedy required by law.",
          "We may suspend or terminate access for breach, suspected fraud, security threats, nonpayment, legal requirements, or material risk to the Service or others. We may act immediately where notice would increase risk or be unlawful; otherwise we will provide notice and a reasonable opportunity to resolve the issue where appropriate. Contact support if you believe a restriction is mistaken. Suspension does not waive amounts lawfully due, and termination does not authorize new renewal charges.",
        ],
      },
      {
        title: "8. Export, deletion, and account records",
        paragraphs: [
          "You may export data or delete your account in Settings. After paid access ends, the workspace is read-only for 30 days and then scheduled for deletion. Existing accounts without a paid subscription are retained during the launch transition. Export before deleting your account or the retention period ends. Account deletion disables access immediately, cancels subscriptions, removes saved keys, and queues private files for deletion. Deleted material cannot be recovered through the Service.",
          "We record your acceptance, the agreement version and text, and the server timestamp with your account. These records are included in your account export and follow account deletion and backup retention practices. Financial records held by payment providers and material already sent to AI providers follow their own terms and legal requirements. See our Privacy and data handling notice for processing and retention details.",
        ],
      },
      {
        title: "9. Disclaimer of warranties",
        paragraphs: [
          "TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE SERVICE AND OUTPUTS ARE PROVIDED AS IS AND AS AVAILABLE, WITHOUT WARRANTIES OF ANY KIND, EXPRESS, IMPLIED, OR STATUTORY, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NONINFRINGEMENT, ACCURACY, SECURITY, AND AVAILABILITY. WE DO NOT WARRANT THAT THE SERVICE WILL BE ERROR-FREE, THAT DEFECTS WILL BE CORRECTED, OR THAT DATA WILL NEVER BE LOST OR EXPOSED. NO SUPPORT COMMUNICATION CREATES A WARRANTY UNLESS EXPRESSLY AGREED IN A SIGNED WRITING. THIS DISCLAIMER DOES NOT REMOVE WARRANTIES OR DUTIES THAT LAW DOES NOT ALLOW US TO EXCLUDE.",
        ],
      },
      {
        title: "10. Limitation of liability",
        paragraphs: [
          "TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE OPERATOR AND ITS PERSONNEL, CONTRACTORS, AND SERVICE PROVIDERS WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR LOST PROFITS, REVENUE, BUSINESS OPPORTUNITIES, GOODWILL, ANTICIPATED SAVINGS, OR DATA, ARISING OUT OF OR RELATED TO THE SERVICE OR THIS AGREEMENT, EVEN IF ADVISED THAT SUCH LOSS WAS POSSIBLE.",
          "TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, OUR TOTAL AGGREGATE LIABILITY FOR ALL CLAIMS ARISING OUT OF OR RELATED TO THE SERVICE OR THIS AGREEMENT WILL NOT EXCEED THE GREATER OF US $100 OR THE SUBSCRIPTION FEES YOU ACTUALLY PAID US IN THE THREE MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM. SEPARATE AI PROVIDER FEES ARE NOT FEES PAID TO US. THESE LIMITS APPLY REGARDLESS OF THE LEGAL THEORY AND EVEN IF A LIMITED REMEDY FAILS OF ITS ESSENTIAL PURPOSE.",
          "Nothing in this agreement excludes or limits liability for our fraud, willful misconduct, gross negligence, death or personal injury caused by negligence, or any liability, statutory remedy, or consumer right that cannot lawfully be excluded or limited. Where an exclusion is not permitted, it applies only to the extent the law allows.",
        ],
      },
      {
        title: "11. Indemnity for business use",
        paragraphs: [
          "If you use the Service for a business or organization, to the extent permitted by law you will defend, indemnify, and hold harmless the operator and its personnel and contractors from third-party claims, damages, liabilities, and reasonable legal costs arising from your material infringing another person's rights, your unlawful use, or your material breach of this agreement. This obligation does not apply to the extent a claim results from our breach, negligence, fraud, or willful misconduct.",
          "We will give prompt notice of a claim, reasonable cooperation at your expense, and reasonable control of the defense with qualified counsel. You may not settle a claim in a way that admits fault on our behalf, imposes nonmonetary obligations on us, or fails to fully release us without our written consent. We may participate with our own counsel at our expense.",
        ],
      },
      {
        title: "12. Disputes and rights that remain yours",
        paragraphs: [
          "Please contact the operator to try to resolve concerns informally. This request does not prevent you from going to court, contacting a regulator, or exercising a statutory right, and does not shorten any legal deadline. This agreement does not require arbitration, waive class proceedings, or select an exclusive court or governing jurisdiction. Applicable law determines those matters. Mandatory consumer and privacy protections remain in force.",
        ],
      },
      {
        title: "13. Changes and general terms",
        paragraphs: [
          "The version identified here applies when you accept it. We will notify you of material changes before they apply and obtain renewed agreement where required by law. Changes do not apply retroactively to disputes that have already arisen. If you do not agree to a proposed change, you may stop using the Service and cancel before it takes effect, subject to rights and obligations already accrued.",
          "This agreement and the pricing and checkout terms expressly referenced in it form the agreement for the Service. The Privacy and data handling notice explains how information is handled. If a provision is unenforceable, the remaining provisions continue to apply to the extent lawful. Failure to enforce a provision is not a waiver. You may not transfer this agreement without our consent; we may transfer it with the Service or a business reorganization provided your statutory rights are not reduced. Neither party is responsible for delays caused by circumstances beyond its reasonable control, without limiting nonwaivable duties. Provisions that by their nature should survive termination, including accrued payment obligations, intellectual property, disclaimers, liability limits, and indemnity, survive to the extent permitted by law.",
        ],
      },
    ],
  };
}
