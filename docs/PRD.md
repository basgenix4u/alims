# ALIMS — Super-Detailed Product Requirements Document

## The Global Academic Knowledge Infrastructure
### *Mapping the World’s Academic Lineage*

**Product name:** ALIMS  
**Product promise:** **Preserve. Connect. Activate.**  
**Document type:** Product Requirements Document (implementation-agnostic)  
**Version:** 2.0  
**Status:** Product definition for design, development, institutional partnership, policy, and QA teams  
**Initial market:** Nigerian universities, designed to expand internationally  
**Primary delivery model:** Institution-led platform with hybrid access for independent researchers

> **Important scope boundary:** This document deliberately specifies *what ALIMS must achieve for its users*, the rules it must uphold, and the outcomes it must produce. It does **not** prescribe programming languages, databases, APIs, hosting providers, system architecture, storage mechanisms, algorithms, or other technical implementation decisions. The engineering team determines those choices while meeting the product, security, accessibility, performance, and governance requirements herein.

---

# 1. Executive Summary

## 1.1 What ALIMS is

ALIMS is a global digital infrastructure for preserving, verifying, connecting, discovering, and activating academic knowledge.

It gives every eligible academic output a durable **Research Record**: a structured identity for a project, thesis, dissertation, paper, dataset, software artifact, patent disclosure, report, or other research work. The Research Record can link the work to the people who created it, its institutional context, supervision, contribution roles, versions, sources, follow-on work, collaboration opportunities, and permitted real-world outcomes.

ALIMS is not only a place where documents are uploaded. It is a system that answers questions such as:

- What research exists on a specific problem?
- Who worked on it, and in what role?
- Which institution verified it, if any?
- Which version is the authoritative version?
- Is the full work public, embargoed, restricted, or withdrawn?
- What research built on it, challenged it, replicated it, or used its data?
- Who supervised the research, without implying ownership of it?
- Which people, labs, institutions, datasets, and companies may be relevant to continuing or applying it?
- Can a graduate credibly show an employer evidence of work they actually completed?

## 1.2 The problem ALIMS addresses

Research and academic outputs are often fragmented across departments, physical libraries, personal devices, institutional portals, journals, emails, hard drives, and disconnected databases. Valuable work may be hard to find, difficult to verify, vulnerable to loss, inaccessible after graduation, or impossible to connect to later knowledge and opportunity.

In Nigeria, the National Education Repository and Databank policy identifies a national need to preserve student academic outputs, apply similarity/anti-plagiarism checks, assign durable document identifiers, and digitize historical records. ALIMS is intended to complement such institutional and national objectives by providing workflow, provenance, discovery, contribution, relationship, and activation capabilities. [NERD Policy](https://www.unilorin.edu.ng/wp-content/uploads/2025/04/NERD-Policy.pdf)

Globally, UNESCO’s Open Science Recommendation supports wider, equitable access to research while recognizing that privacy, intellectual property, confidentiality, national security, human-subject protections, and other legitimate restrictions must be respected. ALIMS must enable discovery without forcing all content into unrestricted public access. [UNESCO Recommendation on Open Science](https://unesdoc.unesco.org/ark:/48223/pf0000379949.locale=en)

## 1.3 Why now

The product addresses four converging needs:

1. **Preservation:** Research should not disappear after assessment, graduation, retirement, or a lost computer.
2. **Trust:** Institutions, employers, journals, collaborators, and the public need a defensible way to understand what a record is and what it has—not an unsupported claim that a document is “original.”
3. **Connection:** Modern scholarship produces relationships between people, papers, data, code, institutions, patents, and outcomes. These are often hidden across disconnected systems.
4. **Activation:** Research should be easier to discover for collaboration, continuation, funding, mentorship, recruitment, licensing, and responsible industry engagement.

Crossref reported more than 180 million metadata records describing research outputs in March 2026. This demonstrates both the scale of global scholarly information and the importance of interoperable, rich research metadata. ALIMS must be designed as a contributor to a connected research ecosystem, not as an isolated information silo. [Crossref](https://www.crossref.org/blog/on-metadata-enrichment/)

## 1.4 Product vision

> **ALIMS creates a persistent, trusted map of the people, ideas, institutions, evidence, contributions, and outcomes that form humanity’s academic knowledge.**

Long term, a user searching “Artificial Intelligence + Agriculture + Africa” should be able to explore—not merely download documents—related researchers, institutions, historical work, ongoing work, incomplete work seeking continuation, datasets, methods, publications, research gaps, collaborators, opportunities, patents, and industry-relevant pathways, subject to permissions and rights.

## 1.5 Product principles

1. **A Research Record is more than a file.** A document is one part of a structured, evolving research identity.
2. **Evidence over assertion.** ALIMS must distinguish deposit evidence, identity verification, institutional verification, publication verification, and legal ownership.
3. **No “integrity score.”** A percentage cannot fairly represent a person’s honesty or the legitimacy of their academic work.
4. **No automated accusations.** Similarity and overlap are review signals, not conclusive findings of plagiarism or misconduct.
5. **Human review for consequential outcomes.** People—not automatic systems—make final decisions about approval, misconduct, authorship disputes, and revocation.
6. **Openness with control.** Metadata may be discoverable while full text, datasets, contact details, or commercial materials remain protected.
7. **Academic rank is not contribution.** A professor, supervisor, or senior author must not receive inferred credit merely because of title or position.
8. **Relationships must be explicit.** A supervision relationship, a citation relationship, and a research-descendant relationship are different and must be labeled differently.
9. **Researcher dignity and privacy matter.** ALIMS must preserve opportunity without turning students and researchers into exposed data objects.
10. **Institutional autonomy matters.** Institutions have different academic, privacy, retention, IP, and approval policies; ALIMS supports configured policies within shared global principles.

---

# 2. Strategic Positioning and Scope

## 2.1 Positioning statement

**For** universities, researchers, supervisors, libraries, journals, companies, and public-sector knowledge stakeholders,  
**ALIMS is** a verified academic knowledge infrastructure  
**that** preserves research records, makes their provenance and permitted relationships visible, and turns discoverable knowledge into responsible collaboration and innovation.  
**Unlike** a document repository, plagiarism checker, CV platform, journal index, or professional social network,  
**ALIMS** connects research identity, institutional workflows, contribution evidence, academic lineage, discovery, and activation in one governed ecosystem.

## 2.2 In scope

ALIMS includes the following product capabilities:

1. Institutional onboarding and branded institutional spaces.
2. Hybrid researcher identity: institution-associated and independent researcher access.
3. Research Record creation, submission, preservation, version history, and retrieval.
4. Supervisor, department, examiner, library, and registry verification workflows.
5. Evidence-based verification badges and QR-verifiable certificates.
6. Controlled public discovery, embargoes, restricted content, and access requests.
7. Similarity/provenance review signals and institutional integrity workflows.
8. Contributor declarations and transparent contribution roles.
9. Researcher Academic Passport.
10. Academic lineage and knowledge-relationship mapping.
11. Research search, discovery, and explainable related-research suggestions.
12. Collaboration, unfinished-research continuation, and research challenge opportunities.
13. Permissioned company/researcher/institution engagement.
14. Dispute, correction, withdrawal, and revocation processes.
15. Institution and ecosystem reporting.

## 2.3 Explicitly out of scope

ALIMS must not initially claim to:

- replace universities, registries, journals, libraries, research ethics boards, patent offices, courts, or government regulators;
- provide legal ownership registration, legal copyright enforcement, or legal advice;
- issue a DOI unless a properly authorized external arrangement exists;
- automatically determine plagiarism, cheating, authorship truth, or contribution percentages;
- sell student projects or make academic work available for contract cheating;
- force public release of full research content;
- mediate legal IP transfers or act as a legal escrow provider;
- rank researchers through a single opaque reputation score;
- provide clinical, legal, financial, or safety-sensitive expert conclusions based on unreviewed research.

## 2.4 Release priorities

### Release One: The Trusted Research Record
The first release must make it possible for a university to manage the official journey from research creation to institutional verification and controlled discoverability.

### Release Two: The Academic Lineage Network
The second release must make contributor roles, supervision, research relationships, researcher passports, datasets, and collaboration opportunities visible and meaningful.

### Release Three: Research Activation
The third release must allow approved companies, funders, and institutions to find permitted knowledge and initiate governed opportunities.

### Release Four: Global Knowledge Intelligence
The fourth release must enable explainable semantic discovery, multilingual research mapping, relationship suggestions, and research-gap intelligence.

---

# 3. Definitions and Product Language

| Term | Definition |
|---|---|
| **Research Record** | The canonical ALIMS entry representing one research output and its controlled metadata, versions, relationships, rights, verification, and lifecycle status. |
| **Research Output** | A project, thesis, dissertation, article, report, dataset, code/software, preprint, patent disclosure, presentation, or another approved knowledge artifact. |
| **NXR-ID** | The permanent ALIMS Research Record identifier. It proves that an ALIMS record exists; it is not a legal title, copyright registration, or DOI. |
| **Researcher** | A person with an ALIMS Academic Passport or contributor presence. This includes students, lecturers, professors, independent researchers, and non-academic contributors. |
| **Institutionally Verified** | A status showing that the configured institutional approval process has been completed for the stated Research Record/version. |
| **Self-Published** | A record deposited by a researcher without institutional academic approval. It may have identity/deposit evidence but cannot imply institutional approval. |
| **Deposit Evidence** | Evidence that a verified account deposited a particular file/version at a recorded time. It does not prove legal ownership or original authorship. |
| **Academic Lineage** | An evidence-qualified map of supervision, research influence, collaboration, citation, continuation, and outcome relationships. |
| **Contribution Ledger** | A transparent record of declared contributor roles, levels, acknowledgements, evidence, and disputes. |
| **Embargo** | A defined period during which public metadata may be visible but some or all content remains inaccessible. |
| **Restricted Research** | Research with visibility/download limitations due to privacy, ethics, IP, sponsorship, safety, or institutional policy. |
| **Verification Level** | The evidence level attached to a record: self-published, identity-verified deposit, supervisor-verified, institutionally verified, journal-verified, or revoked/disputed. |
| **Research Activation** | The responsible transition from discoverable knowledge to collaboration, funding, industry contact, licensing discussion, recruitment, or other real-world opportunity. |

---

# 4. User Roles, Needs, and Permissions

## 4.1 Student / early-career researcher

**Primary needs**
- Preserve work beyond graduation.
- Submit an official work without worrying that a revised file will overwrite prior evidence.
- Control whether full work is public.
- Receive a credible, QR-verifiable research record/certificate after institutional approval.
- Build a research portfolio based on demonstrable outputs rather than only a degree title.
- Discover collaborators, related work, and legitimate opportunities.

**May do**
- Create own drafts and self-published records.
- Upload allowed materials.
- Invite contributors and submit contribution declarations.
- Submit official work when affiliated with an eligible institution/programme.
- Respond to review requests and resubmit new versions.
- Control profile/publication settings within institutional policy.
- Create collaboration or unfinished-research opportunities.

**May not do**
- Alter an approved version.
- issue, edit, or revoke an official certificate.
- access another person’s restricted records, review notes, similarity reports, or contact data without permission.
- claim institutional verification without completion of the required process.

## 4.2 Supervisor

**Primary needs**
- See assigned work, latest versions, declared contributors, and pending actions in one place.
- Return work with structured feedback and clear revision requests.
- Confirm supervision without accidentally assuming ownership of the student’s research.
- Track mentorship/academic lineage only where institution policy permits.

**May do**
- Confirm/decline a supervision relationship.
- Review assigned records and make configured decisions.
- Request revision, contribution correction, or integrity review.
- View history of assigned versions and own decisions.
- Maintain public/controlled professional profile.

**May not do**
- edit a student’s submitted file.
- make a final institutional decision unless separately assigned that role.
- view unrelated student work by default.

## 4.3 Department administrator / examiner / registry officer

**Primary needs**
- Run official workflows consistently and auditably.
- Ensure that certificates show correct institutional facts.
- Resolve corrections and policy-driven revocations fairly.

**May do**
- Configure permitted workflow steps according to institutional authority.
- assign reviewers; review assigned records; verify institution facts; issue/revoke/supersede certificates according to role.
- view restricted institutional data only where required for duties.

## 4.4 Librarian / repository manager

**Primary needs**
- Preserve and describe institutional knowledge responsibly.
- Apply metadata quality and access policy.
- Manage historic digitization and long-term discoverability.

**May do**
- improve metadata according to governed process;
- manage embargo/access classifications;
- ingest historical outputs with provenance notes;
- respond to rights/takedown cases where assigned.

## 4.5 Independent researcher

**Primary needs**
- Create a portable, credible academic identity.
- Deposit research without falsely claiming a university approval.
- find collaborators and make work discoverable within chosen restrictions.

## 4.6 Company / innovation lead

**Primary needs**
- Discover research, researchers, labs, methods, and expertise related to a real problem.
- Initiate ethical contact without harvesting private student information.
- Find collaboration, sponsorship, licensing, consultancy, recruitment, or challenge opportunities.

**May not do**
- access private research, hidden contact information, internal review content, or embargoed files without explicit authorization;
- imply that a listed researcher, institution, or research output endorses the company.

## 4.7 Public visitor

**Needs**
- Search and verify publicly available research records and certificates.

**May do**
- view public metadata, public profiles, and public certificates;
- submit an access request where a record permits it;
- report public errors or rights concerns.

---

# 5. End-to-End User Journeys

## 5.1 Official undergraduate project journey

### Starting condition
A student has completed a project under an institution that uses ALIMS.

### Journey
1. The institution creates or verifies the student’s membership.
2. The student signs in and sees their programme, academic session, required project type, and submission deadline.
3. The student creates a Research Record.
4. The student provides required research information, contributors, supervisor(s), access choice, and declarations.
5. The student uploads the selected final document and any allowed appendices.
6. ALIMS confirms that the upload is safely received and provides an upload/deposit receipt. At this stage, the work is **not verified**.
7. The student submits it to the configured academic workflow.
8. The supervisor reviews it. They may approve, return for revision, request a contributor correction, or escalate for an integrity/provenance review.
9. If returned, the student creates a new version. The prior submitted version remains in history.
10. Required institutional stages complete.
11. The registry/officer validates official facts according to policy.
12. ALIMS marks the chosen version **Institutionally Verified**, generates an NXR-ID and certificate, and applies the selected access/embargo rules.
13. The student’s Academic Passport may display the verified record.
14. The public can scan the certificate QR code and see only permitted verification information.

### Success outcome
The institution can confirm the official state of the work; the student has a durable, verifiable research identity; the work is discoverable only to the extent allowed.

## 5.2 Self-published independent research journey

1. A researcher creates an account and verifies identity to the required level.
2. They create a Research Record and upload permitted work.
3. ALIMS records a deposit event and document/version evidence.
4. The record is labeled **Self-Published** or **Identity-Verified Deposit**, never **Institutionally Verified**.
5. The researcher may seek later institutional, journal, or collaborator verification if an approved pathway exists.

### Success outcome
Independent work can be preserved and discovered without creating a false impression of institutional approval.

## 5.3 Research continuation journey

1. A researcher marks a record as incomplete or seeking continuation.
2. They describe what has been completed, why progress stopped, what is needed, access limitations, and desired collaborator roles.
3. Interested researchers see only permitted information.
4. They request collaboration through ALIMS.
5. Before private material is shared, parties accept a collaboration charter covering roles, confidentiality, intended credit, and IP handling.
6. Subsequent work is connected to the prior Research Record as `CONTINUES` or another explicit relationship.

## 5.4 Employer/recruiter verification journey

1. An employer scans a certificate QR code or searches a public Academic Passport.
2. ALIMS displays the verification status, record title, researcher name where permitted, institution, output type, year, NXR-ID, and certificate status.
3. The employer cannot see grades, student IDs, private documents, review comments, or embargoed research.
4. If the researcher enabled professional contact, the employer may request an introduction.

## 5.5 Industry research discovery journey

1. A verified company searches a problem area.
2. ALIMS returns permitted Research Records, researchers, institutions, labs, collaboration opportunities, and challenges.
3. The company filters by field, geography, institution, methodology, research type, verification level, and availability.
4. The company requests an introduction or posts an opportunity.
5. The researcher and, where configured, their institution decide whether to accept.
6. ALIMS records that contact request; it does not transfer IP, promise funding, or disclose confidential research.

---

# 6. Detailed Functional Requirements

## 6.1 Institutional onboarding and management

### Objective
Enable an institution to operate ALIMS as a governed extension of its academic workflow while keeping its data, policies, and branding distinct from other institutions.

### Required institution information
- legal name;
- public display name;
- country and location;
- institution category;
- official web domain;
- authorized institutional representative;
- privacy/data-protection contact;
- academic and library/repository contacts;
- permitted departments, programmes, degree types, and sessions;
- preferred branding;
- access, workflow, certificate, retention, and escalation policies.

### Required outcomes
- An institution must have a visible status: Pending Verification, Verified, Suspended, or Archived.
- Only verified institutions may issue the Institutionally Verified status and certificates.
- Each institution must control its own departments, programme structures, workflow templates, authorised roles, and access policies.
- An institution must not access another institution’s private records, workflow activity, restricted reports, user data, or analytics.

### Edge scenarios
- **Institution changes name:** historical records retain the historical name and show a linked current name where appropriate.
- **Department is merged or renamed:** historical record metadata remains historically accurate; new records use current structure.
- **Institution leaves ALIMS:** public verified records remain verifiable according to retention agreement; no new records may enter the institutional workflow; status explains institution participation state without erasing history.
- **Institution is suspended:** certificate issuance, new official workflow decisions, and public claims of active verification stop; existing public records display an appropriate status according to policy.

## 6.2 Research Record creation

### Objective
Allow a researcher to create a complete, understandable, searchable record without requiring that all research be public.

### Required fields

| Field | Requirement |
|---|---|
| Research output type | Required controlled choice. |
| Title | Required; clear title; 10–500 characters. |
| Abstract | Required for official/publicly discoverable records; 100–10,000 characters. |
| Researcher(s) | At least one named contributor. |
| Institution | Required for official institutional records; optional for independent work. |
| Discipline/field | Required controlled selection, with multi-disciplinary support. |
| Keywords | At least 1 and no more than 20 for discoverable records. |
| Research year/session | Required for academic outputs where applicable. |
| Access choice | Required. |
| Licence/rights statement | Required. |
| Contributors and roles | Required where more than one contributor exists. |
| Supervisor(s) | Required where institutional workflow requires it. |

### Optional fields
- research question;
- methodology;
- funding source;
- ethics approval reference;
- dataset and code links;
- equipment/lab used;
- external partner;
- publication/patent references;
- language(s);
- commercial/continuation status;
- related research records.

### User-facing validation
- The user must see clear, specific messages for incomplete or invalid fields.
- Fields must explain why information is required and whether it will be public, institutional-only, or private.
- The user must be able to save a draft without completing every publication/approval field.
- A user cannot submit an official record until required institutional fields are complete.

## 6.3 Upload, preservation, and version history

### Objective
Preserve evidence of each meaningful submitted version while enabling legitimate revisions.

### Required behavior
- The product must confirm successful file receipt before a user believes an upload is complete.
- Each uploaded version must have a record of when it was received and which account submitted it.
- A submitted or approved version must not be silently overwritten.
- A revision must become a new version with a human-readable change summary.
- Users must see which version is current, which versions were returned, approved, superseded, withdrawn, or under dispute.
- The product must retain prior versions according to policy, even if only the current version is publicly visible.

### File experience requirements
- Users must see accepted formats, size limits, progress, interruption status, and completion confirmation before upload begins.
- If a network interruption occurs, the user must be able to resume where feasible or restart without losing Research Record metadata.
- If a file is unsafe or unsupported, the user must receive a simple, non-technical explanation and a next action.
- A user must not be able to submit a file that is still processing or failed safety checks.

### Duplicate-content behavior
If a newly uploaded file is identical or materially overlaps an existing protected record, ALIMS must protect the original owner’s confidentiality. It may notify the uploader that overlap requires review, but must not reveal the other record’s title, author, institution, or content unless the uploader is entitled to see it.

## 6.4 Verification and certificate experience

### Verification labels
ALIMS must use visibly distinct labels:

| Label | Meaning |
|---|---|
| Draft | Work is being prepared and is not publicly verified. |
| Submitted | Work entered a review workflow. |
| Identity-Verified Deposit | A verified identity deposited this version; no institution has necessarily approved it. |
| Self-Published | Researcher published the record independently. |
| Supervisor-Verified | A confirmed supervisor completed the configured supervisory attestation. |
| Institutionally Verified | All configured institutional approval stages have completed for this version. |
| Journal-Verified | Connected publisher/journal verification exists. |
| Under Dispute | A claim is under active review; this is not a misconduct finding. |
| Withdrawn | Record has been withdrawn, with reason visibility controlled by policy. |
| Verification Revoked | Previously issued verification is no longer valid. |

### Certificate requirements
An institutionally verified record must be eligible for a certificate containing only approved information:
- certificate identifier;
- NXR-ID;
- title;
- researcher name(s), where approved;
- institution;
- output type;
- issue date;
- verification level;
- QR verification code;
- certificate status.

### Certificate restrictions
The certificate must not state or imply:
- that ALIMS has legally determined copyright ownership;
- that a work is completely original in every respect;
- that a similarity result proves or disproves misconduct;
- that a degree was awarded unless the institution has specifically authorised such a credential statement.

### Public QR verification page
The QR destination must show a clear status: Valid, Superseded, Revoked, or Not Found. It must not reveal private academic, identity, assessment, or review data.

## 6.5 Integrity and provenance review

### Objective
Help institutions identify potential overlap, attribution, and provenance issues without turning software output into a final accusation.

### Requirements
- A record can have a similarity assessment status: not requested, pending, completed, provider delayed, review required, reviewed, or unavailable.
- Similarity results are private to authorised roles.
- A high overlap signal must create a review opportunity, not automatic public labeling, rejection, disciplinary conclusion, or certificate cancellation.
- A reviewer must choose an outcome and provide a reason: no issue, citation correction required, attribution correction required, escalation to formal institutional process, or inconclusive.
- The student/researcher must be informed of a required revision or formal escalation in understandable language and through the institution’s policy.
- Formal academic misconduct proceedings remain an institutional responsibility; ALIMS records authorised workflow status but does not adjudicate law or discipline.

### Essential fairness scenario
If Student B uploads work that strongly overlaps Student A’s older verified record, ALIMS should state to authorised reviewers:

> “Potential overlap with existing registered research has been identified. Review provenance, attribution, permissions, and institutional policy.”

It must not automatically say:

> “Student B is a thief” or “plagiarism confirmed.”

## 6.6 Access, embargo, and rights management

### Access levels

| Access level | Public metadata | Abstract | Full work | Who may access |
|---|---:|---:|---:|---|
| Metadata public | Yes | Optional | No | Anyone sees allowed metadata. |
| Abstract public | Yes | Yes | No | Anyone sees metadata/abstract. |
| Full public | Yes | Yes | Yes | Anyone, subject to licence. |
| Institution only | No public listing unless allowed | Institution policy | Institution policy | Eligible institutional users. |
| Restricted | Minimal/no public visibility | Controlled | Controlled | Named/approved users only. |

### Embargo requirements
- A user selects an embargo period when allowed by policy.
- Before selecting, the interface explains the difference between metadata visibility and document visibility.
- When an embargo expires, release must follow institution/owner policy; no full document should become public contrary to active rights restrictions or unresolved disputes.
- Owners/authorized institutions receive notice before a planned change in access.

### Access request requirements
- A researcher, company, or public visitor may request access only where the owner/institution enables it.
- The request must state purpose and requester identity/organization.
- The recipient may approve, decline, request information, or ignore according to policy.
- No requester receives private email/contact information without consent.

## 6.7 Contributor Ledger

### Objective
Make contribution more transparent than author order or academic title alone.

ALIMS uses the standardized CRediT contributor-role framework, which defines 14 roles including conceptualization, methodology, software, data curation, writing, supervision, and funding acquisition. [NISO CRediT](https://www.niso.org/press-releases/contributor-roles-taxonomy-credit-formalized-ansiniso-standard)

### Requirements
- A record with multiple contributors must identify each contributor and their declared role(s).
- Each role can be described as lead, equal, or supporting.
- Contributors may attach supporting evidence where policy permits.
- Each contributor must have an opportunity to acknowledge, request correction, dispute, or record no response.
- A disputed contribution declaration must be visibly unresolved to authorised institutional parties and must follow dispute policy before final verified public presentation where required.
- A supervisor role must be represented as supervision, not automatically as authorship.
- The product must not generate a single “contribution score” based on rank, seniority, citations, or activity.

## 6.8 Academic Passport

### Objective
Give each researcher a portable, evidence-backed academic identity—not merely a static CV.

### Passport contents
- identity and persistent researcher identifiers where connected;
- institution-verified affiliations;
- educational record claims where verified and permitted;
- Research Records and verification levels;
- declared/acknowledged contribution roles;
- fields, methods, skills, and research interests;
- supervision and mentorship relationships where authorized;
- collaborations;
- datasets, software, publications, patents, awards, peer-review activity, and outcomes where connected;
- availability for collaboration or industry contact;
- selected public impact indicators with source and date.

### Passport restrictions
- A user decides which optional profile sections are public, network-only, institutional, or private, subject to official record rules.
- The Passport must label all claims by evidence source: self-declared, institution-verified, journal-linked, or externally linked.
- It must not present an opaque global score such as “Academic Integrity 93%” or “Researcher Quality 8.5/10.”

## 6.9 Academic lineage and knowledge graph

### Objective
Show how research and people connect while avoiding unsupported claims of intellectual ownership.

### Relationship types
- supervised by;
- co-supervised by;
- contributed to;
- affiliated with;
- cites;
- builds on;
- extends;
- challenges;
- replicates;
- uses dataset;
- produces dataset;
- published as;
- continues;
- collaborates on;
- funded by;
- resulted in;
- adopted by;
- licensed to.

### Requirements
- Every visible relationship must identify its relationship type.
- A relationship must record whether it is self-declared, verified, externally imported, machine-suggested, accepted, disputed, or rejected.
- Machine-suggested relationships must never be presented publicly as fact unless accepted or verified.
- A user must be able to report an inaccurate relationship.
- Academic lineage visualisation must not imply that supervision equals intellectual ownership or that a supervisor is responsible for every later work of a student.

## 6.10 Search and research discovery

### Objective
Help users answer “what knowledge exists around this problem?” rather than merely “which documents contain these words?”

### Search requirements
Users must be able to search by:
- keywords/phrases;
- research question;
- discipline;
- research output type;
- researcher;
- institution;
- country/region;
- year/session;
- methodology;
- verification level;
- access level;
- data/software availability;
- collaboration status;
- opportunity type.

### Search result requirements
Each result must clearly show:
- title;
- type;
- safe contributor display information;
- institution where allowed;
- year;
- brief abstract excerpt;
- verification level;
- access status;
- relationship/related-work indicators where permitted.

Search must never expose restricted titles, abstracts, personal data, files, reviewer notes, or private commercial information to an unauthorised viewer.

## 6.11 Explainable intelligence and related-work suggestions

### Objective
Help people discover meaningful connections they may not find manually.

### Requirements
- ALIMS may suggest related Research Records, possible research relationships, potential collaborators, or potential gaps.
- Every suggestion must explain the basis in plain language, for example: shared topic, common method, cited source, similar dataset, or complementary skills.
- Suggestions must indicate uncertainty/confidence in understandable language.
- Users must be able to dismiss, report, save, or accept suggestions.
- A suggestion must not create public lineage, contributor credit, institution affiliation, or misconduct implication without human confirmation.
- Restricted content must not be used for recommendations outside permitted processing/consent rules.

## 6.12 Collaboration and global research opportunities

### Collaboration opportunity requirements
A researcher may create a collaboration opportunity with:
- title;
- problem statement;
- status;
- field;
- desired contributor roles;
- what has already been completed;
- what is needed;
- deadline if applicable;
- confidentiality level;
- visibility level;
- funding/IP expectations;
- linked Research Records.

### Incomplete research
A researcher can select **Incomplete — Seeking Continuation** and specify reason categories including funding ended, graduation, equipment unavailable, dataset unavailable, supervisor change, time constraint, or other.

### Collaboration charter
Before restricted material/workspace access, collaborators must accept a charter that states:
- participating parties;
- expected roles;
- confidentiality terms;
- preliminary authorship/contribution expectation;
- IP/disclosure status;
- decision process;
- conflict/dispute route;
- publication approval expectations.

ALIMS records acceptance; it does not replace legal agreements where legal agreements are required.

## 6.13 Research activation and industry engagement

### Company verification
Companies must complete a defined verification process before posting opportunities or requesting protected introductions.

### Permitted opportunity types
- research challenge;
- collaboration request;
- sponsored research inquiry;
- expert consultation;
- recruitment/research talent opportunity;
- data/laboratory partnership request;
- technology-transfer/licensing interest;
- funding opportunity;
- mentorship opportunity.

### Contact protection
- Companies see only contact information a researcher/institution has chosen to share.
- For protected records, the company sends a request through ALIMS.
- The researcher and/or institution can accept, decline, or request details.
- Declines must be neutral; no private reason is shared unless the recipient chooses.

### IP and commercialization boundary
ALIMS may capture interest and route it to the appropriate researcher or institution office. It must not imply that a company receives ownership, rights, exclusivity, or access merely by discovering a record or requesting contact.

---

# 7. Status Models and Business Rules

## 7.1 Research Record lifecycle

```text
Draft
→ Submitted
→ In Review
→ Returned for Revision
→ Resubmitted
→ Institutionally Verified
→ Published/Discoverable (subject to access rules)
→ Superseded / Withdrawn / Under Dispute / Verification Revoked
```

### Rules
- Only a draft can be directly edited.
- A returned record must be resubmitted as a new version.
- Institutionally verified status applies to a specific version, not vaguely to every future change.
- A record can be discoverable while its full file remains embargoed.
- A withdrawn/revoked record retains a controlled historical trace for audit and verification status, subject to law/policy.

## 7.2 Certificate lifecycle

```text
Not Issued → Valid → Superseded OR Revoked
```

- Superseded means a later certificate/version replaces it; it is not necessarily invalid due to misconduct.
- Revoked means the certificate must no longer be relied upon for the stated verification claim.
- Certificate QR verification must clearly distinguish these outcomes.

## 7.3 Dispute lifecycle

```text
Submitted → Triage → Evidence Requested → Under Review → Resolved / Dismissed / Escalated
```

### Dispute categories
- incorrect metadata;
- authorship/contribution;
- false institution claim;
- duplicate/provenance conflict;
- copyright/rights claim;
- privacy/confidentiality;
- offensive/unsafe content;
- certificate/verification error;
- relationship/lineage error.

---

# 8. Edge Cases and Required Product Responses

| Scenario | Required ALIMS behavior |
|---|---|
| Student loses connection while writing metadata | Preserve unsent work locally where permitted; clearly show unsaved state; never claim it is submitted until receipt exists. |
| Student loses connection during file upload | Offer safe resume/retry; preserve record metadata; clearly show whether the file was fully received. |
| A file is infected or unsafe | Block use/download, explain that the file cannot be accepted, permit safe replacement, and avoid exposing internal security details. |
| Same file is uploaded twice by same student | Ask whether user intends a new version or accidental duplicate; do not create confusion. |
| Same file is uploaded by different users | Preserve confidentiality; create authorised provenance review signal without exposing other user’s restricted work. |
| Supervisor does not respond before deadline | Send reminders and escalation according to institution policy; never auto-approve simply because a deadline passed unless institution explicitly configured a valid delegated rule. |
| Supervisor leaves the university | Institution reassigns workflow; existing supervision relation remains historically accurate; new approval must be by authorized replacement. |
| Student disputes supervisor’s contribution claim | Mark contributor declaration disputed; route privately to configured institutional process; do not publicly assign final blame. |
| Student wants full work removed after verification | Follow institutional retention/right policy; may restrict public access while retaining necessary official archival evidence. |
| Full work contains private participant data | Require restricted classification and appropriate review; prevent public release unless compliant redacted version is supplied. |
| Research may be patentable | Support embargo/restricted route and technology-transfer notification; do not force public disclosure. |
| Certificate QR code is copied | QR resolves only to public verification status; no sensitive record data is embedded in the QR itself. |
| A company contacts a student directly | Only possible if user made direct contact public; otherwise use request/consent route. |
| AI suggests an incorrect relationship | User can reject/report it; it remains non-public and must not affect reputation or verification. |
| A user changes their name | Preserve legal/audit identity privately; allow updated display name; show historic attribution according to user/institution policy. |
| Institution imports old hardcopy projects | Label provenance as historical digitization; record source, digitizer, confidence, and whether original student/supervisor verification is unavailable. |
| Journal publication is corrected/retracted | Update connected record status/relationship with source attribution; do not delete historic relationship silently. |
| Platform receives government/legal request | Follow verified legal process and documented policy; restrict access only as required; maintain audit trail and notify affected parties where legally allowed. |

---

# 9. Non-Functional Product Requirements

## 9.1 Trust, security, and privacy

ALIMS must:
- protect personal data, academic records, reviewer comments, restricted files, and identity information;
- make permissions understandable to non-technical users;
- require stronger identity checks for high-impact actions such as certificate issuance, revocation, institutional administration, and sensitive data access;
- prevent unauthorised viewing, downloading, editing, or approval of records;
- maintain a tamper-evident audit history for important actions;
- communicate safely during security or processing failures without exposing sensitive system details;
- allow institutions to apply required privacy, consent, retention, and access policies;
- use current recognized security practice and undergo regular independent security review.

OWASP identifies broken object-level authorization, broken authentication, property-level authorization, resource abuse, and other API-related issues as major security risks. Regardless of implementation, ALIMS must ensure that every access to a record, action, field, or download is authorised by the server-side product rules—not merely hidden in the interface. [OWASP API Security Top 10](https://owasp.org/API-Security/editions/2023/en/0x11-t10/)

## 9.2 Availability and responsiveness

Users must experience ALIMS as dependable, especially during academic submission windows.

- Public verification results should ordinarily appear within 2 seconds under normal network conditions.
- Standard page navigation should ordinarily appear within 2 seconds after initial load on a typical mobile connection.
- Search results should ordinarily appear within 3 seconds for common searches.
- Uploads must visibly report progress and processing status.
- The product must degrade gracefully when a non-critical external service, such as a similarity provider, is delayed.
- Scheduled maintenance must be communicated to institutions in advance except in urgent security incidents.

## 9.3 Accessibility and inclusive design

ALIMS must meet WCAG 2.2 AA accessibility standards.

It must support:
- keyboard-only operation;
- screen readers and semantic navigation;
- visible focus states;
- readable contrast;
- text alternatives for non-text content;
- clear error messages that do not depend on colour alone;
- responsive mobile layouts;
- low-bandwidth and interrupted-connectivity use;
- plain-language explanations for students unfamiliar with research infrastructure.

## 9.4 Localization and global readiness

- English is the first language.
- The product must be prepared for additional languages, local date formats, names, institutional structures, currencies, legal policies, and accessibility needs.
- Product language must avoid culture-specific assumptions about names, titles, degree structures, academic calendars, and authorship conventions.

## 9.5 Data quality

- Important metadata must be validated at entry and periodically reviewed.
- Records must show when metadata is self-declared, institution-verified, journal-linked, or imported.
- Bulk historic migration must preserve source and confidence level.
- The platform must avoid silently “correcting” author names, institutions, or relationships without evidence or authorised action.

---

# 10. Reporting and Success Metrics

## 10.1 Institution dashboard metrics

Institutions must be able to view, subject to role:
- total records by type, department, programme, session, status, and access level;
- submission-to-verification duration;
- pending review workload and overdue tasks;
- metadata completeness;
- number of certificates issued/superseded/revoked;
- access requests and outcomes;
- similarity assessment status distribution;
- records under embargo/restricted/dispute;
- search/discovery engagement for public records;
- collaboration and industry-interest activity;
- historic digitization progress.

## 10.2 Product success metrics

### Release One
- number of verified institutions;
- number/percentage of eligible projects submitted through ALIMS;
- verified records issued;
- median approval time;
- upload and processing completion rate;
- certificate verification success rate;
- access-control incident count (target: zero);
- percentage of records with complete required metadata.

### Release Two
- researcher passport activation rate;
- contributor acknowledgement rate;
- verified supervision/lineage relationships;
- cross-institution collaboration requests and acceptances;
- related-work suggestion acceptance/rejection rate.

### Release Three and Four
- company/funder verification rate;
- approved research introductions;
- sponsored research/challenge responses;
- research continuation matches;
- reported research-to-industry outcomes;
- searches that produce saved/contacted/collaboration outcomes.

---

# 11. Acceptance Criteria and QA Scenarios

## 11.1 Official submission

```gherkin
Scenario: Student completes an official project submission
  Given a student has an active verified membership in an eligible programme
  And the institution has configured a project submission workflow
  When the student completes required Research Record fields and uploads an accepted final file
  And signs the required submission declarations
  And submits the record
  Then the record status becomes Submitted
  And the assigned supervisor receives a review task
  And the student receives a submission receipt
  And the record is not described as Institutionally Verified
```

## 11.2 Revision history

```gherkin
Scenario: Supervisor returns a record for correction
  Given a Research Record is awaiting supervisor review
  When the supervisor returns it with a required revision comment
  Then the student sees the comment and required next action
  And the submitted version remains visible in the version history
  When the student submits corrected work
  Then a new version is created
  And the original submitted version is not overwritten
```

## 11.3 No automatic integrity accusation

```gherkin
Scenario: A similarity review indicates substantial overlap
  Given a submitted record has received a similarity result requiring institutional review
  When the similarity result is recorded
  Then only authorized reviewers can see the detailed assessment
  And the student is not publicly labelled dishonest
  And the record is not automatically rejected
  And the reviewer must choose and record a human decision
```

## 11.4 Embargo protection

```gherkin
Scenario: A verified thesis has a 24-month full-text embargo
  Given the Research Record is institutionally verified
  And its metadata is public but the document embargo has not ended
  When a public visitor searches for the title
  Then they can see permitted metadata and verification status
  And they cannot download the full file
  And they cannot access private review, student ID, grade, or similarity information
```

## 11.5 Certificate verification

```gherkin
Scenario: Employer scans a valid certificate QR code
  Given a valid certificate exists for an institutionally verified record
  When an employer scans the QR code
  Then ALIMS shows the certificate as Valid
  And shows only approved public verification information
  And does not disclose private academic or identity data
```

## 11.6 Contribution dispute

```gherkin
Scenario: A contributor disputes a declared contribution role
  Given a contributor was invited to acknowledge a role declaration
  When they submit a dispute
  Then the contribution status is marked Disputed
  And the designated institutional dispute process is notified
  And the system does not silently remove the contributor
  And the public contribution presentation follows institution policy until resolution
```

## 11.7 Independent publishing distinction

```gherkin
Scenario: Independent researcher deposits work
  Given a researcher has a verified ALIMS account but no institutional approval
  When they publish a Research Record
  Then the record is labelled Self-Published or Identity-Verified Deposit
  And it cannot display Institutionally Verified
  And its deposit evidence is available according to selected visibility
```

## 11.8 Restricted contact

```gherkin
Scenario: A company wants to contact an embargoed-record owner
  Given a company is verified
  And a Research Record permits metadata discovery but not public contact details
  When the company requests an introduction
  Then the researcher or authorized institution contact receives the request
  And the company does not receive private contact information
  When the recipient declines
  Then the company receives a neutral decline response
```

## 11.9 AI suggestion control

```gherkin
Scenario: ALIMS suggests a possible research relationship
  Given the product identifies potentially related research
  When it presents a relationship suggestion
  Then it explains the matching basis and uncertainty
  And it is labelled as a suggestion
  And it is not publicly displayed as fact until an authorized person accepts or verifies it
```

---

# 12. Final Product Statement

**ALIMS preserves academic work before it disappears. It connects the people, ideas, evidence, institutions, contributions, and descendants of research without confusing status, ownership, or academic rank. It activates trusted knowledge into responsible discovery, collaboration, innovation, and opportunity.**

**Preserve knowledge. Connect lineage. Activate impact.**
