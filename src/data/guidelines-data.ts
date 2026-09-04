// AUTO-GENERATED from the Supabase `guidelines` table by scripts/export-static.ts.
// Do not edit by hand — change the database and run `npm run export-static`.
// Generated: 2026-09-04 — 231 records.

export type GuidelineVersion = {
  label: string;
  date?: string;
  url: string;
};

export type Guideline = {
  id: string;
  section: string;
  topic: string;
  subGroup?: string;
  source: string;
  type: string;
  summary: string;
  regionalVariation: boolean;
  localOverlayNeeded: boolean;
  notes?: string;
  lastChecked: string;
  status: string;
  crossListedIn?: string[];
  versions: GuidelineVersion[];
  priority?: 'high' | 'medium' | 'low';
  archived?: boolean;
  sourceAccessStatus?: 'accessible' | 'login-required' | 'broken';
  linkVerificationStatus?: 'unchecked' | 'needs-review' | 'broken' | 'verified';
  linkLastVerified?: string;
  linkVerificationNotes?: string;
};

export const GUIDELINES_DATA: Guideline[] = [
  {
    "id": "nice-abaloparatide-ta991",
    "section": "Bone Health",
    "type": "National guidance",
    "topic": "Abaloparatide for treating osteoporosis after menopause",
    "subGroup": "Published Aug 2024",
    "source": "NICE",
    "summary": "Recommends abaloparatide (Eladynos) for treating osteoporosis after menopause in women, trans men and non-binary people at very high risk of fracture. A new anabolic bone-building alternative to teriparatide.",
    "notes": "TA991. Published Aug 2024. Simple discount patient access scheme applies.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Older Adult"
    ],
    "priority": "medium",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/ta991.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/ta991",
        "label": "Published Aug 2024"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-bisphosphonates-ta464",
    "section": "Bone Health",
    "type": "National guidance",
    "topic": "Bisphosphonates for treating osteoporosis",
    "subGroup": "Published 2017, updated July 2019",
    "source": "NICE",
    "summary": "Recommends alendronic acid, ibandronic acid, risedronate sodium and zoledronic acid for treating osteoporosis. Treatment thresholds are determined by plotting FRAX score and T-score against the guidance risk grid. Includes a patient decision aid. First-line pharmacological management.",
    "notes": "TA464. Published Aug 2017; last updated July 2019. Partially updated the older raloxifene appraisals TA160/TA161.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Older Adult"
    ],
    "priority": "high",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/ta464.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/ta464",
        "label": "Published 2017, updated July 2019"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bostaa-dexa-position",
    "section": "Bone Health",
    "type": "Specialist society guidance",
    "topic": "BOSTAA response on DEXA scanning",
    "subGroup": "May 2026",
    "source": "BOSTAA",
    "summary": "BOSTAA position response on DEXA scanning, clarifying its limited role in assessing body composition in young athletic populations and that it should not be routinely used outside osteoporosis pathways. The society's most recent formal position statement.",
    "notes": "6 May 2026 - very recent. Content not fully read in either pass; verify relevance to the Bone Health section before including.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Knee",
      "Imaging",
      "Sports Injuries"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "CONFIRMED 29/07/2026: page live, dated 6 May 2026. Full content read: BOSTAA advises against routine/commercial public DEXA scanning (insufficient evidence of benefit, radiation and body-image-harm concerns) but supports its use for monitoring in elite athletes under medical supervision. Relevant and appropriate for the Bone Health section.",
    "versions": [
      {
        "url": "https://bostaa.ac.uk/BOSTAA-Response-on-DEXA-scanning",
        "label": "May 2026"
      },
      {
        "url": "https://www.bostaa.ac.uk/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-denosumab-ta204",
    "section": "Bone Health",
    "type": "National guidance",
    "topic": "Denosumab for prevention of osteoporotic fractures in postmenopausal women",
    "subGroup": "Published 2010, updated March 2014",
    "source": "NICE",
    "summary": "Recommends denosumab (Prolia) for postmenopausal women at increased risk of osteoporotic fragility fracture who cannot comply with the special instructions for alendronate or risedronate, or are intolerant of them. Administered as biannual subcutaneous injection.",
    "notes": "TA204. Published Oct 2010; last updated March 2014.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Older Adult"
    ],
    "priority": "medium",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/ta204.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/ta204",
        "label": "Published 2010, updated March 2014"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "fls-db",
    "section": "Bone Health",
    "type": "National guidance",
    "topic": "Fracture Liaison Service Database (FLS-DB) - national audit",
    "subGroup": "Current",
    "source": "FFFAP (RCP)",
    "summary": "The national audit of Fracture Liaison Services - secondary fracture prevention. Sets 11 Key Performance Indicators measuring performance against NICE technology appraisals, NICE/ROS/NOGG osteoporosis guidance and the ROS FLS clinical standards. Tracks whether patients with a fragility fracture receive DXA, bone-health assessment and bone-sparing medication within 16 weeks. Must be reported in every English trust's Quality Account; required by Welsh Government for all Health Boards. A quarter of people who break their hip will have another fragility fracture; GIRFT notes only just over half of NHS acute trusts provide an FLS, with ~90,000 people missing out annually.",
    "notes": "MERGED RECORD - deduped from 'fls-db' and 'fls-db-audit' which were the same audit. Sister audit to NHFD under FFFAP; was NOT on the original source list.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Trauma",
      "Local Overlay",
      "Service & Commissioning"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-22",
    "linkVerificationNotes": "URL confirmed in FFFAP resources site navigation; KPI structure confirmed in the NOGG 2024 guideline Section 12. | 2026-08-22 remediation: primary and web-portal URLs updated from obsolete rcplondon.ac.uk / fffap.org.uk paths to the current RCP FFFAP FLS-DB page (HTTP 200 confirmed). | 2026-08-23 cleanup: collapsed duplicate version URLs. Removed \"FLS-DB web portal\" (byte-identical to \"Current\" after the 2026-08-22 RCP remediation — RCP consolidated the portal into the audit page) and \"FFFAP FLS resources\" (byte-identical to \"Fallback / index page\"; a pre-existing duplicate, not introduced by Batch 1). No destination lost: both distinct live URLs are retained.",
    "versions": [
      {
        "url": "https://www.rcp.ac.uk/improving-care/national-clinical-audits/falls-and-fragility-fracture-audit-programme-fffap/fracture-liaison-service-database-fls-db/",
        "label": "Current"
      },
      {
        "url": "https://nhfd.co.uk/FFFAP/Resources.nsf/pages/FLS",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "iof-capture-the-fracture",
    "section": "Bone Health",
    "type": "Specialist society guidance",
    "topic": "IOF Capture the Fracture - Best Practice Framework",
    "subGroup": "Current",
    "source": "International Osteoporosis Foundation",
    "summary": "Thirteen standards for FLS delivery with criteria and targets specified for bronze, silver and gold levels of achievement. The international benchmarking framework UK FLS services are measured against.",
    "notes": "International (not UK-specific) but cited by NOGG as a reference standard. Include only if international benchmarking context is wanted.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Service & Commissioning",
      "Older Adult"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "RE-CONFIRMED 29/07/2026: live and correct. This is a single specific standard (the Best Practice Framework, IOF's internationally-endorsed FLS benchmark), not a multi-item index - the triage flag was a false positive.",
    "versions": [
      {
        "url": "https://www.capturethefracture.org/best-practice-framework",
        "label": "Current"
      },
      {
        "url": "https://www.capturethefracture.org/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "naif-inpatient-falls",
    "section": "Bone Health",
    "type": "National guidance",
    "topic": "National Audit of Inpatient Falls (NAIF)",
    "subGroup": "Current",
    "source": "FFFAP (RCP)",
    "summary": "The national audit of inpatient falls - prevention and post-fall management in hospital. Tracks patients who sustain a hip or femoral fracture while admitted for another reason (2.5% of hip fractures nationally) and mandates they receive the same rapid orthogeriatric and surgical care as community admissions. Relevant to falls assessment as a BPT criterion.",
    "notes": "Third FFFAP audit - was NOT on the original source list. Relevant but lower priority for an on-call orthopaedic hub than FLS-DB.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Trauma",
      "Service & Commissioning"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-22",
    "linkVerificationNotes": "URL confirmed in FFFAP resources site navigation. | 2026-08-22 remediation: obsolete fffap.org.uk/naif fallback updated to the current RCP FFFAP NAIF page (HTTP 200 confirmed).",
    "versions": [
      {
        "url": "https://nhfd.co.uk/FFFAP/Resources.nsf/pages/NAIF",
        "label": "Current"
      },
      {
        "url": "https://www.rcp.ac.uk/improving-care/national-clinical-audits/falls-and-fragility-fracture-audit-programme-fffap/national-audit-of-inpatient-falls-naif/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nogg-osteoporosis-guideline",
    "section": "Bone Health",
    "type": "National guidance",
    "topic": "NOGG clinical guideline for the prevention and treatment of osteoporosis",
    "subGroup": "2024",
    "source": "NOGG (National Osteoporosis Guideline Group)",
    "summary": "The UK's principal osteoporosis guideline, in twelve sections: scope; osteoporosis and fragility fractures; fracture risk assessment and case finding (FRAX-based); intervention thresholds and strategy; non-pharmacological management; pharmacological treatment options; strategies for management; management of symptomatic osteoporotic vertebral fractures; models of care for fracture prevention; training; recommendations for commissioners; and audit criteria. NOGG DEFINES THE FRAX-BASED INTERVENTION THRESHOLDS that determine who gets treated - the practical decision rule NICE CG146 does not provide.",
    "notes": "2024 version - current. Full guideline browsable online plus downloadable PDF and a Summary of Main Recommendations. Read alongside NICE CG146 and QS149. Arguably more operationally useful than the NICE osteoporosis guidance.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Trauma",
      "Spine",
      "Older Adult"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified - full guideline structure and section list fetched directly from nogg.org.uk.",
    "versions": [
      {
        "url": "https://www.nogg.org.uk/full-guideline",
        "label": "2024"
      },
      {
        "url": "https://www.nogg.org.uk/",
        "label": "Fallback / index page"
      },
      {
        "url": "https://www.nogg.org.uk",
        "label": "Resource centre: /resource-centre (prefix"
      }
    ]
  },
  {
    "id": "nice-osteoporosis-risk-cg146",
    "section": "Bone Health",
    "type": "National guidance",
    "topic": "Osteoporosis - assessing the risk of fragility fracture",
    "subGroup": "Published 2012, updated Feb 2017",
    "source": "NICE",
    "summary": "Assessing fragility-fracture risk in adults, focusing on selection and use of risk assessment tools (FRAX, QFracture) across all NHS settings. Provides thresholds for DXA and bone density assessment (e.g. all women over 65 and men over 75). Guides who to assess and which method to use.",
    "notes": "CG146. Published Aug 2012; last updated Feb 2017, reviewed Oct 2024. An update is in progress (GID-NG10216) to add treatment recommendations. Essential for FLS.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Older Adult",
      "Elective"
    ],
    "priority": "medium",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/cg146.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/cg146",
        "label": "Published 2012, updated Feb 2017"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-osteoporosis-qs149",
    "section": "Bone Health",
    "type": "National guidance",
    "topic": "Osteoporosis - quality standard",
    "subGroup": "Published April 2017",
    "source": "NICE",
    "summary": "Quality standard for managing osteoporosis in adults, including fragility-fracture risk assessment and prevention. Four statements: risk assessment, starting drug treatment, managing adverse effects/adherence, and long-term follow-up. Monitored via the FLS-DB.",
    "notes": "QS149. Published April 2017. Endorsed by NHS England.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Older Adult",
      "Service & Commissioning"
    ],
    "priority": "medium",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/qs149.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/qs149",
        "label": "Published April 2017"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-raloxifene-ta160",
    "section": "Bone Health",
    "type": "National guidance",
    "topic": "Raloxifene - primary prevention of fragility fractures",
    "subGroup": "Published 2008, updated Feb 2018",
    "source": "NICE",
    "summary": "Raloxifene for primary prevention of osteoporotic fragility fractures in postmenopausal women with osteoporosis who have not yet fractured and cannot take alendronate or risedronate.",
    "notes": "TA160. Published Oct 2008; last updated Feb 2018. Less commonly used now given newer agents.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Older Adult"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/ta160.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/ta160",
        "label": "Published 2008, updated Feb 2018"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-raloxifene-teriparatide-ta161",
    "section": "Bone Health",
    "type": "National guidance",
    "topic": "Raloxifene & teriparatide - secondary prevention of fragility fractures",
    "subGroup": "Published 2008, updated Feb 2018",
    "source": "NICE",
    "summary": "Raloxifene and teriparatide for secondary prevention of osteoporotic fragility fractures in postmenopausal women with osteoporosis who cannot tolerate bisphosphonates. Also applies to teriparatide biosimilars; teriparatide is reserved for very severe cases (over 65, T-score below -4.0).",
    "notes": "TA161. Published Oct 2008; last updated Feb 2018 (strontium ranelate/etidronate removed - no longer marketed). Current bisphosphonate guidance is TA464.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Older Adult"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/ta161.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/ta161",
        "label": "Published 2008, updated Feb 2018"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-romosozumab-ta791",
    "section": "Bone Health",
    "type": "National guidance",
    "topic": "Romosozumab for treating severe osteoporosis",
    "subGroup": "Published May 2022",
    "source": "NICE",
    "summary": "Recommends romosozumab (EVENITY) for severe osteoporosis after menopause in people at high risk of fracture - specifically those who have had a major osteoporotic fracture within the past 24 months. Highly potent bone-builder restricted to highest risk.",
    "notes": "TA791. Published May 2022. Simple discount patient access scheme applies.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Older Adult"
    ],
    "priority": "medium",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/ta791.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/ta791",
        "label": "Published May 2022"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "ros-clinical-quality-toolkits",
    "section": "Bone Health",
    "type": "Specialist society guidance",
    "topic": "ROS clinical quality toolkits (4 items - was 5, site restructured)",
    "subGroup": "Current",
    "source": "Royal Osteoporosis Society",
    "summary": "Five clinical quality toolkits: DXA quality, hip fracture, vertebral fracture, FLS implementation, and virtual/telephone appointments. Includes six ROS quality standards for DXA reporting (2019) with an audit template - a 2020 audit across 6 UK NHS DXA services found variable compliance.",
    "notes": "Practical audit/improvement tools for commissioners and clinicians.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Trauma",
      "Spine",
      "Local Overlay",
      "Service & Commissioning"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "FIXED 29/07/2026: the Royal Osteoporosis Society has restructured its entire site since the last audit pass - the old URL (theros.org.uk/healthcare-professionals/...) still resolves but redirects to a new canonical path (theros.org.uk/for-healthcare-professionals/...). The page itself has also changed content: it now lists 4 items (Hip fracture toolkit, FLS Implementation Toolkit, Medicine support for patients, Clinical publications and resources), not the 5 toolkits (which used to include separate DXA quality and Vertebral fracture toolkits) recorded in the prior audit. Primary URL updated to the canonical path; all 4 current items added as direct links. Topic corrected from '5 toolkits' to reflect the current 4. | 2026-08-23 cleanup: removed the \"Fallback / index page\" version entry, whose URL was byte-identical to \"Current\" (the clinical quality toolkits index) and therefore offered no fallback. The four specific toolkit links on this row are untouched.",
    "versions": [
      {
        "url": "https://theros.org.uk/for-healthcare-professionals/clinical-quality-hub/clinical-quality-toolkits/",
        "label": "Current"
      },
      {
        "url": "https://theros.org.uk/for-healthcare-professionals/clinical-quality-hub/clinical-quality-toolkits/hip-fracture-toolkit/",
        "label": "Hip fracture toolkit"
      },
      {
        "url": "https://theros.org.uk/for-healthcare-professionals/clinical-quality-hub/clinical-quality-toolkits/fracture-liaison-services/",
        "label": "FLS Implementation Toolkit"
      },
      {
        "url": "https://theros.org.uk/for-healthcare-professionals/clinical-quality-hub/clinical-quality-toolkits/medicine-support-for-patients/",
        "label": "Medicine support for patients (BoneMed Online)"
      },
      {
        "url": "https://theros.org.uk/for-healthcare-professionals/clinical-quality-hub/clinical-quality-toolkits/clinical-publications-and-resources/",
        "label": "Clinical publications and resources"
      }
    ]
  },
  {
    "id": "ros-osteoporosis-quality-standards",
    "section": "Bone Health",
    "type": "Specialist society guidance",
    "topic": "ROS quality standards for osteoporosis and prevention of fragility fractures",
    "subGroup": "November 2017",
    "source": "Royal Osteoporosis Society",
    "summary": "Seven quality standards for osteoporosis and fragility fracture prevention - the ROS counterpart to NICE QS149 (which has four). Establishes clinical benchmarks for identifying and treating low bone density in primary and secondary care.",
    "notes": "November 2017. Direct PDF.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Older Adult",
      "Service & Commissioning"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "PDF URL cited in the NOGG 2024 guideline Section 12.",
    "versions": [
      {
        "url": "https://theros.org.uk/media/0dillsrh/ros-op-standards-november-2017.pdf",
        "label": "November 2017"
      },
      {
        "url": "https://theros.org.uk/healthcare-professionals/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "ros-fls-clinical-standards",
    "section": "Bone Health",
    "type": "Specialist society guidance",
    "topic": "UK Fracture Liaison Service (FLS) clinical standards",
    "subGroup": "2019",
    "source": "Royal Osteoporosis Society",
    "summary": "Six key clinical standards for Fracture Liaison Services with a timeline for achievement and audit/evidence examples, framed around identification, investigation, information, intervention and integration. Endorsed by nine professional bodies including the BOA, BGS, BSR, CSP, RCP and RPS. Accompanied by the FLS Implementation Toolkit - gap analysis, care pathways and FLS-DB data submission support.",
    "notes": "Standards published 2019. The document GIRFT and NHFD both lean on when criticising FLS coverage - GIRFT notes only just over half of NHS acute trusts provide an FLS, with ~90,000 people missing out annually. Scotland has 100% FLS coverage; England does not.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Trauma",
      "Local Overlay",
      "Service & Commissioning"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URLs cited in the NOGG 2024 guideline (Section 12) - a national guideline citing them.",
    "versions": [
      {
        "url": "https://theros.org.uk/healthcare-professionals/clinical-quality-hub/fracture-liaison-services/",
        "label": "2019"
      },
      {
        "url": "https://theros.org.uk/healthcare-professionals/",
        "label": "Fallback / index page"
      },
      {
        "url": "https://theros.org.uk/healthcare-professionals/clinical-quality-hub/fracture-liaison-services/implementation-toolkit/",
        "label": "FLS Implementation Toolkit"
      }
    ]
  },
  {
    "id": "bhs-adult-hip-dysplasia",
    "section": "Elective",
    "type": "Specialist society guidance",
    "topic": "Adult hip dysplasia - BHS surgical standard",
    "subGroup": "Current",
    "source": "British Hip Society (NAHR)",
    "summary": "BHS Surgical Standard on adult hip dysplasia - assessment, patient selection and management including periacetabular osteotomy versus arthroplasty, with mandatory NAHR registry use. The adult counterpart to the BSCOS DDH consensus (under 3 months).",
    "notes": "NAHR surgical standard. NEW - not on the original checklist. Pairs with the BSCOS DDH consensus to give a full lifespan view of hip dysplasia.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Hip",
      "Paediatrics"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URL listed on the BHS official NAHR Surgical Standards page.",
    "versions": [
      {
        "url": "https://britishhipsociety.com/Portals/0/Downloads/NAHR/BHSSS-Adult-Hip-Dysplasia.pdf",
        "label": "Current"
      },
      {
        "url": "https://britishhipsociety.com/resources/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-apixaban-vte-ta245",
    "section": "Elective",
    "type": "National guidance",
    "topic": "Apixaban for VTE prevention after hip/knee replacement",
    "subGroup": "Published Jan 2012",
    "source": "NICE",
    "summary": "Apixaban (Eliquis) for preventing venous thromboembolism after elective primary total hip or knee replacement in adults. Often preferred oral VTE prophylaxis in ERAS pathways.",
    "notes": "TA245. Published Jan 2012; last reviewed March 2015.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Knee",
      "Hip"
    ],
    "priority": "medium",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/ta245.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/ta245",
        "label": "Published Jan 2012"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-arthroscopic-fai-htg273",
    "section": "Elective",
    "type": "National guidance",
    "topic": "Arthroscopic femoro-acetabular surgery for hip impingement",
    "subGroup": "Published Sept 2011",
    "source": "NICE",
    "summary": "Removing cartilage/bone arthroscopically to reshape the joint surface in femoroacetabular impingement (cam/pincer). Relieves pain and improves function under standard governance, though long-term prevention of osteoarthritis is unproven.",
    "notes": "HTG273 (migrated from IPG408, replacing IPG213). Published Sept 2011. Standard UK approach for FAI.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Hip",
      "Sports Injuries"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg273.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg273",
        "label": "Published Sept 2011"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bhs-girft-hip-arthroplasty-op-record",
    "section": "Elective",
    "type": "Specialist society guidance",
    "topic": "Best practice for the hip arthroplasty operation record",
    "subGroup": "Current",
    "source": "GIRFT / BHS / BOA",
    "summary": "Joint guidance on what must be documented in a hip arthroplasty operation record - 24+ documentation points including final component positioning, intra-operative assessment of stability and range of movement (extension/external rotation and flexion/adduction/internal rotation), intra-operative complications, leg lengths, vascular and neurological status, post-operative antibiotic/Hb/X-ray/VTE plan, mobilisation instructions, and implant size/LOT numbers for the NJR. Cross-references NatSSIPs.",
    "notes": "Hosted on the BOA site. Directly practical for anyone writing up a hip arthroplasty op note.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Hip",
      "Local Overlay",
      "Service & Commissioning"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "BOA asset URL confirmed; content read via search.",
    "versions": [
      {
        "url": "https://www.boa.ac.uk/asset/EB642048-8596-413A-A1AE249743A05103/",
        "label": "Current"
      },
      {
        "url": "https://britishhipsociety.com/resources/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bhs-revision-hip-standards",
    "section": "Elective",
    "type": "Specialist society guidance",
    "topic": "BHS Surgical Standards (BHSSS) - revision hip surgery",
    "subGroup": "2022",
    "source": "British Hip Society",
    "summary": "Eight surgical standards setting requirements for revision hip surgery, developed by a 60-member national advisory panel (Prof Tim Board / Andy Hamer) to underpin regional revision hip networks. Covers revision for instability, revision for aseptic loosening, periprosthetic joint infection, periprosthetic fracture, peri-operative care, MDT working, MDT IT specifications, and mentorship/dual-consultant operating. Core principle: units undertaking revision hip surgery must be part of a revision network, with complex and re-revision cases routinely discussed at a regional network MDT.",
    "notes": "Developed from 2020; BHSSS series, 2022. URL MIGRATION APPLIED - the older /wp-content/uploads/2022/02/ URLs are superseded by /Portals/0/Downloads/. Both currently resolve but the old ones are at risk.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Hip",
      "Infection & Tumour",
      "Trauma",
      "Local Overlay"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "All 8 URLs listed on the current BHS official Revision Hip Network page; instability standard content-verified via search.",
    "versions": [
      {
        "url": "https://britishhipsociety.com/Portals/0/Downloads/Revision-Hip-Network/BHSSS-Revision-for-instability.pdf",
        "label": "2022"
      },
      {
        "url": "https://britishhipsociety.com/resources/",
        "label": "Fallback / index page"
      },
      {
        "url": "https://britishhipsociety.com/Portals/0/Downloads/Revision-Hip-Network/",
        "label": "Dual consultant: .../BHSSS-Dual-Consultant.pdf (all prefixed"
      }
    ]
  },
  {
    "id": "nice-dabigatran-vte-ta157",
    "section": "Elective",
    "type": "National guidance",
    "topic": "Dabigatran etexilate for VTE prevention after hip/knee replacement",
    "subGroup": "Published Sept 2008",
    "source": "NICE",
    "summary": "Dabigatran etexilate (Pradaxa) for preventing venous thromboembolism after elective hip or knee replacement surgery in adults. Formulary alternative to LMWH injections.",
    "notes": "TA157. Published Sept 2008; last reviewed Aug 2011.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Knee",
      "Hip"
    ],
    "priority": "medium",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/ta157.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/ta157",
        "label": "Published Sept 2008"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-digital-oa-htg766",
    "section": "Elective",
    "type": "National guidance",
    "topic": "Digital technologies for mild-moderate hip/knee OA symptoms (EVA)",
    "subGroup": "Published Jan 2026 (verify)",
    "source": "NICE",
    "summary": "Early value assessment of digital exercise and education platforms (e.g. Joint Academy) for managing mild-to-moderate hip or knee osteoarthritis symptoms in primary and community care. Conditional recommendation while evidence is generated.",
    "notes": "HTG766. Published Jan 2026 (second pass suggests Feb 2024 - VERIFY DATE). Early value assessment.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Knee",
      "Hip",
      "Rehabilitation"
    ],
    "priority": "medium",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg766.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg766",
        "label": "Published Jan 2026 (verify)"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-itb-lengthening-gtps-htg246",
    "section": "Elective",
    "type": "National guidance",
    "topic": "Distal iliotibial band lengthening for refractory greater trochanteric pain syndrome",
    "subGroup": "Published Jan 2011",
    "source": "NICE",
    "summary": "Lengthening the iliotibial band for refractory greater trochanteric pain syndrome. Evidence on efficacy and safety is inadequate - research use only; routine NHS funding not supported. Rarely performed.",
    "notes": "HTG246 (migrated from IPG375). Published Jan 2011.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Hip"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg246.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg246",
        "label": "Published Jan 2011"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bess-ebi-list-2-guidance",
    "section": "Elective",
    "type": "National guidance",
    "topic": "EBI List 2 Guidance (shoulder)",
    "subGroup": "2021",
    "source": "BESS / NHS EBI Programme",
    "summary": "Guidance on NHS Evidence-Based Interventions List 2 procedures as they apply to shoulder surgery - interventions only performed when specific criteria are met. Defines funding criteria for subacromial decompression (must have failed 3 months of non-operative care including physiotherapy and injection).",
    "notes": "2021. Commissioning/criteria document directly tied to trust funding.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Shoulder & Elbow",
      "Local Overlay",
      "Service & Commissioning"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-22",
    "linkVerificationNotes": "URL from the BESS official Primary & Intermediate Care Guidelines page. | 2026-08-22 remediation: dead primary (bess.ac.uk download path, HTTP 404) replaced with the canonical AoMRC EBI List 2 guidance PDF on ebi.aomrc.org.uk (HTTP 200 confirmed).",
    "versions": [
      {
        "url": "https://ebi.aomrc.org.uk/wp-content/uploads/2024/01/EBI_list2_guidance_no_coding_0923.pdf",
        "label": "2021"
      },
      {
        "url": "https://bess.ac.uk/patient-care-pathways-and-guidelines/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-ecswt-gtps-htg248",
    "section": "Elective",
    "type": "National guidance",
    "topic": "Extracorporeal shockwave therapy for refractory greater trochanteric pain syndrome",
    "subGroup": "Published Jan 2011",
    "source": "NICE",
    "summary": "Delivering sound waves to the painful area to stimulate healing in refractory greater trochanteric pain syndrome. A safe non-invasive alternative before considering surgery, under standard governance.",
    "notes": "HTG248 (migrated from IPG376). Published Jan 2011.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Hip",
      "Rehabilitation"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg248.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg248",
        "label": "Published Jan 2011"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bhs-fai-standard",
    "section": "Elective",
    "type": "Specialist society guidance",
    "topic": "Femoroacetabular impingement (FAI) - BHS surgical standard",
    "subGroup": "Current",
    "source": "British Hip Society (NAHR)",
    "summary": "BHS Surgical Standard on femoroacetabular impingement syndrome - assessment, patient selection and surgical management. Mandates that all cases are uploaded to the Non-Arthroplasty Hip Registry (NAHR) to track hip preservation outcomes. The society-level counterpart to NICE HTG273 and HTG270.",
    "notes": "NAHR surgical standard.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Hip",
      "Sports Injuries"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URL listed on the BHS official NAHR Surgical Standards page.",
    "versions": [
      {
        "url": "https://britishhipsociety.com/Portals/0/Downloads/NAHR/BHSSS-FAI.pdf",
        "label": "Current"
      },
      {
        "url": "https://britishhipsociety.com/resources/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "girft-group-and-save-hip-knee",
    "section": "Elective",
    "type": "National guidance",
    "topic": "Group and Save testing for primary hip and knee replacement - best practice guide",
    "subGroup": "May 2026",
    "source": "GIRFT (NHS England)",
    "summary": "Best-practice guide on rationalising Group and Save testing for primary hip and knee replacement, reducing unnecessary pre-operative blood testing.",
    "notes": "FINAL, May 2026 - very recent.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Knee",
      "Hip",
      "Local Overlay"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URL from the GIRFT Academy resources page ('See what's new').",
    "versions": [
      {
        "url": "https://gettingitrightfirsttime.co.uk/wp-content/uploads/2026/05/Best-practice-guide-Group-and-Save-testing-for-primary-hip-and-knee-replacement-FINAL-May-2026.pdf",
        "label": "May 2026"
      },
      {
        "url": "https://gettingitrightfirsttime.co.uk/academy-resources/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-mis-thr-htg236",
    "section": "Elective",
    "type": "National guidance",
    "topic": "Minimally invasive total hip replacement",
    "subGroup": "Published Oct 2010",
    "source": "NICE",
    "summary": "Total hip replacement through smaller incisions than standard open surgery. Safe but requires careful retractor placement to avoid nerve/tissue damage; internal surgical steps remain identical to standard THR.",
    "notes": "HTG236 (migrated from IPG363, replacing IPG112 and IPG152). Published Oct 2010.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Hip"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg236.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg236",
        "label": "Published Oct 2010"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "ebi-mri-hip-arthritis",
    "section": "Elective",
    "type": "National guidance",
    "topic": "MRI scan of the hip for arthritis",
    "source": "NHS Evidence-Based Interventions (EBI) programme / Academy of Medical Royal Colleges",
    "summary": "Guidance on when MRI of the hip is (and is not) indicated for suspected/confirmed hip osteoarthritis, as part of the NHS Evidence-Based Interventions programme. Uses the BRAN framework (Benefits, Risks, Alternatives, do Nothing) for shared decision-making.",
    "notes": "Published Jan 2020, last reviewed Sept 2024. Individual EBI intervention page (parent overview: nhs-ebi-programme).",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Quick Reference"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "CONFIRMED 29/07/2026: fetched directly, exact deep link to this specific intervention page (not the generic EBI front page). Full content read - Summary/Recommendation/Rationale/Patient information/Coding/References sections all present and current as of the page's own 'last reviewed' date.",
    "versions": [
      {
        "url": "https://ebi.aomrc.org.uk/interventions/mri-scan-of-the-hip-for-arthritis/",
        "label": "Current"
      },
      {
        "url": "https://ebi.aomrc.org.uk/specialty/musculoskeletal-spine/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nhs-ebi-programme",
    "section": "Elective",
    "type": "National guidance",
    "topic": "NHS Evidence-Based Interventions (EBI) programme - elective thresholds",
    "subGroup": "List 1 2018/19, List 2 Nov 2020, List 3 May 2023",
    "source": "Academy of Medical Royal Colleges / NHS England / NICE / GIRFT",
    "summary": "National guidance defining which interventions should NOT be routinely funded (Category 1 - 'do not do', zero payment without an Individual Funding Request) and which are restricted access (Category 2 - funded only when specific clinical threshold criteria are met, e.g. failed conservative management or a disease-severity threshold). Part of the NHS Standard Contract. Three waves: List 1 (2018/19, 17 interventions), List 2 (Nov 2020, 31 interventions), List 3 (May 2023, 10 interventions). Orthopaedic content developed WITH the BOA, BASK, BESS, BASS and BHS. Determines whether referrals for knee arthroscopy, subacromial decompression, carpal tunnel release, Dupuytren's, trigger finger or ganglion excision will actually be funded.",
    "notes": "The 'will it get commissioned' layer above the clinical guidelines. NOTE: the BOA formally raised concerns with NHS England (with BESS and BSSH) about reduction targets and prior-approval processes. LIST 3 URL NOT YET VERIFIED - flagged rather than guessed.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Knee",
      "Shoulder & Elbow",
      "Hand & Wrist",
      "Spine",
      "Local Overlay",
      "Service & Commissioning"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-22",
    "linkVerificationNotes": "List 1 and List 2 PDF URLs verified on ebi.aomrc.org.uk. List 3 exists (May 2023) but its canonical URL is NOT confirmed. | UPDATED 29/07/2026: this row is the programme-level overview only. All 17 individual Musculoskeletal/Spine EBI intervention guidelines now have their own dedicated rows (IDs prefixed 'ebi-') with direct deep links to each specific guideline, its recommendation and its references - not just this front-page link. This mirrors the same fix applied here; the other ~44 EBI interventions outside Musculoskeletal/Spine (Breast, Cardiovascular, Child health, ENT, Eyes, GI, Haematology, Kidney/urology, Pre-op assessment, Skin/soft tissue, Women's health) have NOT yet been individually expanded - flag if you want those pulled out too. | 2026-08-22 remediation: removed the redundant dead BESS List 2 shoulder-guidance link (HTTP 404); canonical AoMRC List 2 PDF already present.",
    "versions": [
      {
        "url": "https://ebi.aomrc.org.uk/",
        "label": "List 1 2018/19, List 2 Nov 2020, List 3 May 2023"
      },
      {
        "url": "https://www.aomrc.org.uk/ebi/",
        "label": "Fallback / index page"
      },
      {
        "url": "https://ebi.aomrc.org.uk/wp-content/uploads/2024/01/EBI_list_1_Statutory_Guidance_no_coding_0923.pdf",
        "label": "List 1 statutory guidance (17 interventions, rev Sept 2023)"
      },
      {
        "url": "https://ebi.aomrc.org.uk/wp-content/uploads/2024/01/EBI_list2_guidance_no_coding_0923.pdf",
        "label": "List 2 guidance (31 interventions, rev Sept 2023)"
      },
      {
        "url": "https://www.boa.ac.uk/resource/nhs-england-evidence-based-interventions-publication-and-response-from-the-boa.html",
        "label": "BOA response"
      }
    ]
  },
  {
    "id": "nice-open-fai-htg270",
    "section": "Elective",
    "type": "National guidance",
    "topic": "Open femoro-acetabular surgery for hip impingement",
    "subGroup": "Published July 2011",
    "source": "NICE",
    "summary": "Removing cartilage/bone via an open approach (surgical dislocation) to reshape the joint surface in FAI. A major procedure with AVN risk, requiring specific surgeon expertise. Reserved for cases where arthroscopy is insufficient.",
    "notes": "HTG270 (migrated from IPG403, replacing IPG203). Published July 2011.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Hip"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg270.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg270",
        "label": "Published July 2011"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "girft-orthopaedic-surgery-report",
    "section": "Elective",
    "type": "National guidance",
    "topic": "Orthopaedic surgery - GIRFT national specialty report (elective)",
    "subGroup": "2015 / 2020",
    "source": "GIRFT (NHS England)",
    "summary": "GIRFT's 2015 landmark orthopaedic report (the pilot for the whole GIRFT programme, led by Prof Tim Briggs) plus the 2020 follow-up 'Getting It Right in Orthopaedics'. Covers procedure volumes, implant selection and procurement (reducing reliance on expensive loan kits), infection rates, length of stay, and unwarranted variation. Drove the shift to cemented hip replacement in over-65s (~10% increase, est. GBP 4.4m p.a. saving).",
    "notes": "2015 original; 2020 follow-up. BOA co-badged. BOA also publishes implementation guidance and the GIRFT 'Further Faster' orthopaedics master handbook (2024).",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Local Overlay",
      "Service & Commissioning"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Specialty page and BOA GIRFT page verified. | 2026-08-23 cleanup: removed the \"BOA implementation guidance\" version entry, whose URL was byte-identical to \"Fallback / index page\" (both https://www.boa.ac.uk/standards-guidance/getting-it-right-first-time.html). The BOA page does serve as the implementation guidance, so the label is recorded here rather than kept as a duplicate link.",
    "versions": [
      {
        "url": "https://gettingitrightfirsttime.co.uk/surgical_specialties/orthopaedic-surgery/",
        "label": "2015 / 2020"
      },
      {
        "url": "https://www.boa.ac.uk/standards-guidance/getting-it-right-first-time.html",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-osteoarthritis-ng226",
    "section": "Elective",
    "type": "National guidance",
    "topic": "Osteoarthritis in over 16s - diagnosis and management",
    "subGroup": "Published Oct 2022",
    "source": "NICE",
    "summary": "Diagnosis, assessment and non-surgical management of osteoarthritis, plus referral for joint replacement and advice on arthroscopic procedures. Therapeutic exercise, physiotherapy and weight management are the primary recommended treatments; medication is second-line; intra-articular hyaluronan should not be offered.",
    "notes": "NG226. Published Oct 2022; replaces CG177. Non-surgical focus - surgical care sits in NG157.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Knee",
      "Foot & Ankle",
      "Hand & Wrist",
      "Rehabilitation"
    ],
    "priority": "high",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/ng226.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/ng226",
        "label": "Published Oct 2022"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-osteoarthritis-qs87",
    "section": "Elective",
    "type": "National guidance",
    "topic": "Osteoarthritis in over 16s - quality standard",
    "subGroup": "Published 2015, updated Oct 2022",
    "source": "NICE",
    "summary": "Eight statements covering diagnosis, assessment, therapeutic exercise, weight loss and core treatments before surgical referral. Advises against requesting imaging for hip OA diagnosis, management or referral decisions. Does not cover joint replacement itself (see QS206).",
    "notes": "QS87. Published June 2015; last updated Oct 2022 (aligned with NG226).",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Knee",
      "Foot & Ankle",
      "Service & Commissioning"
    ],
    "priority": "medium",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/qs87.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/qs87",
        "label": "Published 2015, updated Oct 2022"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-joint-replacement-ng157",
    "section": "Elective",
    "type": "National guidance",
    "topic": "Primary joint replacement - hip, knee and shoulder",
    "subGroup": "Published June 2020, reviewed Dec 2024",
    "source": "NICE",
    "summary": "Care before, during and after planned hip, knee or shoulder replacement. Includes shared decision-making, pre-op rehabilitation, anaesthesia, tranexamic acid, infection prevention, avoiding implant-selection errors, procedure-specific recommendations and post-op/long-term care. Teams should discuss return to work before surgery.",
    "notes": "NG157. Published June 2020; last reviewed Dec 2024 (added links to relevant TAs for hip implants). Aligns with GIRFT elective pathways.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Knee",
      "Shoulder & Elbow",
      "Hip"
    ],
    "priority": "high",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/ng157.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/ng157",
        "label": "Published June 2020, reviewed Dec 2024"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-joint-replacement-qs206",
    "section": "Elective",
    "type": "National guidance",
    "topic": "Primary joint replacement (hip, knee, shoulder) - quality standard",
    "subGroup": "Published March 2022",
    "source": "NICE",
    "summary": "Five statements for adults before, during and after primary elective hip, knee or shoulder replacement: pre-op rehabilitation advice, partial vs total knee replacement choice, tranexamic acid, preventing implant-selection errors, and post-op rehabilitation. Does not cover joint replacement for bone cancer.",
    "notes": "QS206. Published March 2022. Complements GIRFT HVLC standards.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Knee",
      "Shoulder & Elbow",
      "Service & Commissioning"
    ],
    "priority": "medium",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/qs206.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/qs206",
        "label": "Published March 2022"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-rivaroxaban-vte-ta170",
    "section": "Elective",
    "type": "National guidance",
    "topic": "Rivaroxaban for VTE prevention after hip/knee replacement",
    "subGroup": "Published April 2009",
    "source": "NICE",
    "summary": "Rivaroxaban (Xarelto) for preventing venous thromboembolism after elective total hip or knee replacement in adults. Equivalent option to apixaban depending on trust formulary.",
    "notes": "TA170. Published April 2009; last reviewed May 2012.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Knee",
      "Hip"
    ],
    "priority": "medium",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/ta170.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/ta170",
        "label": "Published April 2009"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-supercapsular-tha-htg626",
    "section": "Elective",
    "type": "National guidance",
    "topic": "Supercapsular percutaneously assisted total hip arthroplasty for OA",
    "subGroup": "Published May 2022",
    "source": "NICE",
    "summary": "SuperPath total hip replacement through smaller incisions than standard surgery, for osteoarthritis. Evidence on safety and efficacy adequate, but surgeons must undergo specific training due to the steep learning curve.",
    "notes": "HTG626 (migrated from IPG726). Published May 2022. Dec 2025 note: Profemur L cobalt-chrome modular stem withdrawn (device safety notification) - no longer covered.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Hip"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg626.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg626",
        "label": "Published May 2022"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bhs-surgical-prioritisation",
    "section": "Elective",
    "type": "Specialist society guidance",
    "topic": "Surgical prioritisation for hip conditions - BHS consensus",
    "subGroup": "2021",
    "source": "British Hip Society",
    "summary": "Formal three-round Delphi consensus (70% threshold) creating a prioritisation framework for hip surgery when resources are constrained - P1 to P4 priority codes ensuring progressive conditions (AVN, severe dysplasia) are prioritised over standard OA. Developed in response to COVID-19 waiting list pressures but applicable to any capacity-limited situation.",
    "notes": "Relevant to elective recovery and waiting list management.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Hip",
      "Local Overlay",
      "Service & Commissioning"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "BHS news page confirmed; document referenced.",
    "versions": [
      {
        "url": "https://britishhipsociety.com/latest-documnet-on-surgical-prioritisation/",
        "label": "2021"
      },
      {
        "url": "https://britishhipsociety.com/resources/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-thr-resurfacing-ta304",
    "section": "Elective",
    "type": "National guidance",
    "topic": "Total hip replacement & resurfacing for end-stage hip arthritis",
    "subGroup": "Published Feb 2014",
    "source": "NICE",
    "summary": "Artificial hips and hip resurfacing for end-stage hip arthritis in adults. Recommends prostheses with an ODEP rating of at least 10A (10-year revision rate under 5%). Mandates ODEP compliance for implant procurement.",
    "notes": "TA304. Published Feb 2014; last reviewed April 2017. Replaced TA2 (prosthesis selection) and TA44 (metal-on-metal resurfacing).",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Hip"
    ],
    "priority": "high",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/ta304.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/ta304",
        "label": "Published Feb 2014"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "arterial-injury-msk-trauma",
    "section": "Emergencies",
    "type": "Specialist society guidance",
    "topic": "Arterial / vascular injury with MSK trauma",
    "subGroup": "June 2026",
    "source": "BOA (BOASt)",
    "summary": "Limb-threatening vascular compromise with fracture/dislocation needs urgent reduction, reassessment of perfusion and immediate vascular/plastics involvement. Hard signs (absent pulses, expanding haematoma, active bleeding) mandate emergency revascularisation within 1 hour - do not delay for angiography if the limb is ischaemic. Temporary vascular shunt recommended to restore flow.",
    "notes": "June 2026 version supersedes the archived 'arterial injuries associated with extremity fractures and dislocations'.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Trauma"
    ],
    "priority": "high",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified against fetched PDF. June 2026 currency confirmed by second pass.",
    "versions": [
      {
        "url": "https://www.boa.ac.uk/asset/7E8D1CA3%2D7448%2D47C7%2D84980C6D3E7E96B0/",
        "label": "June 2026"
      },
      {
        "url": "https://www.boa.ac.uk/standards-guidance/boasts.html",
        "label": "Fallback / index page"
      },
      {
        "url": "https://www.boa.ac.uk/asset/6C475A69-3056-4149-98DB80A87C962786/",
        "label": "Archived (pre-June 2026)"
      }
    ]
  },
  {
    "id": "bass-cauda-equina-standards",
    "section": "Emergencies",
    "type": "Specialist society guidance",
    "topic": "BASS standards of care for cauda equina syndrome",
    "subGroup": "March 2015",
    "source": "BASS (British Association of Spine Surgeons)",
    "summary": "BASS's original CES standards - the first UK spinal society standard, prompted by concern patients were being harmed by delayed diagnosis and surgery. Core position: the clinical diagnosis of CES lacks sensitivity and specificity - no symptom or sign, INCLUDING digital rectal examination, allows you to diagnose or exclude CES until the lesion is severe and often irreversible. Therefore prompt MRI and emergency surgery in appropriate cases. Emphasises detailed neurological documentation for medico-legal purposes.",
    "notes": "Published Spine Journal 2015;15(3 Suppl):S2-S4 (Germon, Ahuja, Casey, Todd, Rai). LARGELY SUPERSEDED IN PRACTICE by the GIRFT National Suspected CES Pathway (March 2026), which BASS co-badged. Keep as the foundational document; use GIRFT as the operative one. Hoeritzauer et al (2023) found NO useful interobserver agreement on CES subcategories even among experienced spinal surgeons.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Spine"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Publication confirmed (PubMed 25708139).",
    "versions": [
      {
        "url": "https://pubmed.ncbi.nlm.nih.gov/25708139/",
        "label": "March 2015"
      },
      {
        "url": "https://spinesurgeons.ac.uk/Guidelines",
        "label": "Fallback / index page"
      },
      {
        "url": "https://gettingitrightfirsttime.co.uk/wp-content/uploads/2026/04/National-Suspected-Cauda-Equina-Pathway-March-2026.pdf",
        "label": "Current operative pathway (GIRFT, co-badged BASS)"
      }
    ]
  },
  {
    "id": "compartment-syndrome",
    "section": "Emergencies",
    "type": "Specialist society guidance",
    "topic": "Compartment syndrome of the extremities",
    "subGroup": "Revised July 2025",
    "source": "BOA (BOASt)",
    "summary": "Pain out of proportion and pain on passive stretch are the earliest signs - do not wait for the late 6 Ps. Release circumferential dressings, elevate limb to heart level, reassess within 30 minutes, escalate for urgent fasciotomy. Hourly documented assessment in at-risk patients; pressure monitoring if obtunded (diastolic-compartment pressure gap <30 mmHg is concerning).",
    "notes": "Revised July 2025; replaces the archived 'Compartment Syndrome of the Limbs'.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Trauma"
    ],
    "priority": "high",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified against fetched PDF.",
    "versions": [
      {
        "url": "https://www.boa.ac.uk/asset/D0432D40%2D5D99%2D4B64%2D9952F6EB1B60C166/",
        "label": "Revised July 2025"
      },
      {
        "url": "https://www.boa.ac.uk/standards-guidance/boasts.html",
        "label": "Fallback / index page"
      },
      {
        "url": "https://www.boa.ac.uk/asset/2A3DBE24-B921-4395-92631F3BE3160528/",
        "label": "Archived (pre-July 2025)"
      }
    ]
  },
  {
    "id": "pelvic-fracture",
    "section": "Emergencies",
    "type": "Specialist society guidance",
    "topic": "Management of patients with pelvic fractures",
    "subGroup": "January 2018",
    "source": "BOA (BOASt)",
    "summary": "High-energy pelvic fractures can exsanguinate - apply a pelvic binder at the greater trochanters (pre-hospital), give IV tranexamic acid within 1 hour, activate massive transfusion, and transfer unstable patients directly to an MTC. A post-binder X-ray is required even after a 'negative' CT. Assess for associated urological injury.",
    "notes": "January 2018. Companion 'Urological Trauma Associated with Pelvic Fractures' (Aug 2016) included as a version link. CORRECTED: companion URL was previously swapped with the ankle fracture entry.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Trauma"
    ],
    "priority": "high",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified against fetched PDF (both documents). Transposition corrected.",
    "versions": [
      {
        "url": "https://www.boa.ac.uk/asset/E0FF512B%2D6364%2D42EF%2DAF23617E1894D8BD/",
        "label": "January 2018"
      },
      {
        "url": "https://www.boa.ac.uk/standards-guidance/boasts.html",
        "label": "Fallback / index page"
      },
      {
        "url": "https://www.boa.ac.uk/asset/86C72EFF-26AA-4CEC-98D1E85CDA3DAC6C/",
        "label": "Urological Trauma companion (Aug 2016)"
      }
    ]
  },
  {
    "id": "nice-spinal-metastases-mscc-ng234",
    "section": "Emergencies",
    "type": "National guidance",
    "topic": "Spinal metastases & metastatic spinal cord compression (MSCC)",
    "subGroup": "Published Sept 2023, reviewed March 2026",
    "source": "NICE",
    "summary": "Recognition, referral, investigation and management of spinal metastases and MSCC - a time-critical emergency. Back pain in a patient with known or suspected cancer (breast, lung, prostate, lymphoma, myeloma), particularly night/rest pain or pain on straining, plus any neurology, warrants urgent whole-spine MRI within 24 hours and specialist referral. Consider 16mg oral dexamethasone while awaiting definitive treatment. Delay risks permanent paralysis.",
    "notes": "NG234. Published Sept 2023; last reviewed March 2026; replaces CG75. Basis of QS56; read with HTG3. ADDITION - not in the original 128-record catalogue.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Spine",
      "Infection & Tumour"
    ],
    "priority": "high",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/ng234.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/ng234",
        "label": "Published Sept 2023, reviewed March 2026"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "girft-cauda-equina-pathway",
    "section": "Emergencies",
    "type": "National guidance",
    "topic": "Suspected cauda equina syndrome (CES) - national pathway",
    "subGroup": "March 2026",
    "source": "GIRFT (NHS England)",
    "summary": "CES is a spinal surgical emergency. Emergency MRI referral is warranted with leg and/or back pain PLUS recent onset (14 days or less) or deterioration of any of: difficulty initiating micturition or impaired sensation of urinary flow; altered perianal/perineal/genital (S2-S5) sensation; severe or progressive bilateral neurological deficit; loss of sensation of rectal fullness; sexual dysfunction. Emergency MRI within 4 hours of request - sagittal T2 is the key screening sequence. Do NOT delay MRI to discuss with the spinal team first. Do NOT use bladder scan in isolation (60% of operated patients had PVR under 200ml). DRE not necessary but subjective perianal sensation must be documented. Surgery for incomplete CES as NCEPOD E1/E2, as quickly as possible; catheterise before surgery.",
    "notes": "LIVING DOCUMENT - first published Feb 2023, revised Oct 2023, Jul 2024, Feb 2025, Aug 2025, Sep 2025, Jan 2026, Feb 2026, Mar 2026 (current). Co-badged BASS, BAUS, CSP, RCR, SBNS, SIA. IMPORTANT: the original catalogue treated Oct 2023 and Mar 2026 as two competing versions - they are successive revisions of ONE document.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Spine"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified against fetched PDF; March 2026 confirmed current via GIRFT news page AND independently by second pass.",
    "versions": [
      {
        "url": "https://gettingitrightfirsttime.co.uk/wp-content/uploads/2026/04/National-Suspected-Cauda-Equina-Pathway-March-2026.pdf",
        "label": "March 2026"
      },
      {
        "url": "https://gettingitrightfirsttime.co.uk/surgical_specialties/spinal-surgery/",
        "label": "Fallback / index page"
      },
      {
        "url": "https://girft-interactivepathways.org.uk/cauda-equina-1/",
        "label": "Interactive pathway tool"
      },
      {
        "url": "https://gettingitrightfirsttime.co.uk/wp-content/uploads/2023/10/National-Suspected-Cauda-Equina-Pathway-October-2023-version-3.drawio.html",
        "label": "Superseded v3 Oct 2023"
      },
      {
        "url": "https://gettingitrightfirsttime.co.uk/wp-content/uploads/2023/02/National-Suspected-Cauda-Equina-Pathway-February-2023-FINAL-V1-1.pdf",
        "label": "Superseded v1 Feb 2023"
      }
    ]
  },
  {
    "id": "bofas-achilles-acute-rupture",
    "section": "Foot & Ankle",
    "type": "Specialist society guidance",
    "topic": "Acute Achilles tendon rupture",
    "subGroup": "Current",
    "source": "BOFAS (Hyperbook)",
    "summary": "Acute pain with an audible/felt pop, often described as being kicked or shot, after sudden acceleration; usually non-contact. Male:female 5:1. Examine with Simmonds' triad - calf squeeze, altered angle of declination, palpable gap; all three together confirm the injury in most cases. Differentiate from DVT, stress fracture and claudication. X-ray to exclude bony avulsion/calcaneal fracture; ultrasound optional (increasing evidence that US and tendon gap are NOT helpful in management). Initial: back/front slab, analgesia, DVT prophylaxis. Then shared decision-making between non-operative, open repair or mini-open/percutaneous repair - modern evidence shows no or minimal difference in re-rupture rate with functional rehabilitation, with higher complication rates after surgery. UK functional rehab protocol: 2 weeks cast in full plantar flexion NWB, then weight-bear in ROM walker boot in full plantar flexion, reducing plantar flexion 15 degrees every 2 weeks, final 2 weeks plantigrade, heel raises in trainers 4 weeks, then physio. Risk factors include quinolones and corticosteroids.",
    "notes": "BOFAS Hyperbook, Trauma section. Open access, no login. Evidence base includes UKSTAR (Lancet 2020). CLOSES THE ACHILLES GAP.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Trauma",
      "Emergencies",
      "Sports Injuries"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified against fetched page - full clinical content confirmed, no login required.",
    "versions": [
      {
        "url": "https://www.bofas.org.uk/hyperbook/trauma/achilles-tendon-acute-rupture",
        "label": "Current"
      },
      {
        "url": "https://www.bofas.org.uk/hyperbook/home",
        "label": "Fallback / index page"
      },
      {
        "url": "https://www.bofas.org.uk/hyperbook/mid-hindfoot/achilles-tendon-chronic-rupture",
        "label": "Chronic Achilles rupture"
      },
      {
        "url": "https://www.bofas.org.uk/hyperbook/mid-hindfoot/achilles-tendinopathy",
        "label": "Achilles tendinopathy"
      }
    ]
  },
  {
    "id": "bofas-hyperbook-trauma",
    "section": "Foot & Ankle",
    "type": "Specialist society guidance",
    "topic": "BOFAS Hyperbook - Trauma section (foot & ankle injuries)",
    "subGroup": "Current",
    "source": "BOFAS (Hyperbook)",
    "summary": "Open-access clinical reference covering the full range of foot and ankle trauma: ankle fractures (with sub-pages on posterior malleolus, diabetic ankle fractures, fibular nails/MM fixation, hindfoot nails), calcaneal fractures, Lisfranc injury, talus fractures (neck/body and process), pilon fractures, metatarsal fractures, stress fractures, ankle sprains, deltoid ligament injury, compartment syndrome of the foot, crushed foot, tibialis anterior tendon rupture and turf toe. Emphasises CT imaging in high-energy midfoot trauma to avoid missed injuries.",
    "notes": "Open access. A textbook-style reference rather than formal guidelines, but the authoritative UK foot & ankle society resource and far more SHO-usable than a PDF standard. CLOSES THE CALCANEAL FRACTURE AND LISFRANC GAPS. Deep-linking per condition is possible and preferable on mobile.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Trauma",
      "Emergencies"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "All URLs from BOFAS Hyperbook official navigation; Achilles page content-verified as representative.",
    "versions": [
      {
        "url": "https://www.bofas.org.uk/hyperbook/trauma",
        "label": "Current"
      },
      {
        "url": "https://www.bofas.org.uk/hyperbook/home",
        "label": "Fallback / index page"
      },
      {
        "url": "https://www.bofas.org.uk",
        "label": "Turf toe: /hyperbook/trauma/turf-toe-injury (all prefixed"
      }
    ]
  },
  {
    "id": "bofas-pathways-of-care",
    "section": "Foot & Ankle",
    "type": "Specialist society guidance",
    "topic": "BOFAS Pathways of Care in Foot and Ankle Surgery",
    "subGroup": "Undated",
    "source": "BOFAS",
    "summary": "BOFAS's own pathways-of-care document covering referral and management pathways across foot and ankle surgery, defining which procedures can be performed in community/tier 2 services versus consultant-led tier 3 tertiary services.",
    "notes": "Undated on the BOFAS site.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective",
      "Local Overlay",
      "Service & Commissioning"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URL from the BOFAS official publications page; no date given on source page.",
    "versions": [
      {
        "url": "https://www.bofas.org.uk/Portals/0/Position%20Statements/BOFAS%20Pathways%202.pdf",
        "label": "Undated"
      },
      {
        "url": "https://www.bofas.org.uk/clinician/research/bofas-publications",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bofas-registry",
    "section": "Foot & Ankle",
    "type": "National guidance",
    "topic": "BOFAS Registry Annual Report",
    "subGroup": "2025",
    "source": "BOFAS",
    "summary": "National foot & ankle surgery registry with PROMs data. The 2025 report includes outcome comparisons for Achilles tendon rupture treated conservatively vs mini-open/percutaneous vs open surgery (ATRS scores), plus fusion, Morton's neuroma, total ankle replacement survivorship and other pathways. Useful for benchmarking and shared decision-making.",
    "notes": "2025 report. Audit/outcomes data rather than clinical guidance.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Local Overlay",
      "Service & Commissioning"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "PDF URL confirmed via search; hosted on bofas.org.uk.",
    "versions": [
      {
        "url": "https://www.bofas.org.uk/Portals/0/Registry%20Documents/Annual%20Reports/BOFAS_Registry_Report_2025.pdf",
        "label": "2025"
      },
      {
        "url": "https://www.bofas.org.uk/clinician/research/bofas-publications",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bofas-round-table-consensus",
    "section": "Foot & Ankle",
    "type": "Specialist society guidance",
    "topic": "BOFAS Round Table consensus statements (12 booklets, 2011-2025)",
    "subGroup": "2025 (12th)",
    "source": "BOFAS",
    "summary": "Consensus booklets from the annual Foot and Ankle Round Table meetings convened by Dishan Singh. Twelve booklets spanning 2011-2025, each capturing expert consensus on contested foot and ankle topics including severe pilon fractures, Charcot arthropathy and chronic ankle instability. The 2025 Sheffield booklet is current.",
    "notes": "Consensus statements, not formal guidelines - useful where no BOASt or NICE guidance exists.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Elective",
      "Trauma"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-22",
    "linkVerificationNotes": "AUDIT 29/07/2026: Topic states '12 booklets, 2011-2025' but only the single most recent PDF (2025 Sheffield) is linked. The other 11 Round Table booklets were NOT individually located this pass. | 2026-08-22 remediation: removed a placeholder version link whose URL was an unfilled template (Round Table - YYYY - CITY.pdf, HTTP 404). Its label had listed the not-yet-located booklets: 2024 Cambridge, 2023 Stratford, 2019 Krakow, 2018 Belfast, 2017 Cardiff, 2016 Munich, 2015 Edinburgh, 2014 Budapest, 2013 Barcelona, 2012 Paris, 2011 Padova.",
    "versions": [
      {
        "url": "https://www.bofas.org.uk/Portals/0/RoundTable_Booklets/Round%20Table%20-%202025%20-%20Sheffield.pdf",
        "label": "2025 (12th)"
      },
      {
        "url": "https://www.bofas.org.uk/clinician/research/bofas-publications",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "girft-bunions",
    "section": "Foot & Ankle",
    "type": "National guidance",
    "topic": "Bunions (hallux valgus) pathway",
    "subGroup": "Withdrawn pending review",
    "source": "GIRFT (NHS England)",
    "summary": "Elective pathway for bunion/hallux valgus surgery. CURRENTLY UNDER REVIEW by GIRFT - no live document available. Interim: use the BOFAS Hyperbook hallux valgus pages.",
    "notes": "Listed as 'Currently under review' as of July 2026. Re-check periodically.",
    "status": "To source",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Elective"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "RE-CONFIRMED 29/07/2026 via the live official GIRFT pathways index (gettingitrightfirsttime.co.uk/academy-resources/pathways/, page last modified 27/05/2026): still listed as 'Currently under review'. No live pathway URL exists yet - this is not a broken link, it is an accurate reflection of GIRFT's own withdrawal status.",
    "versions": [
      {
        "url": "https://gettingitrightfirsttime.co.uk/academy-resources/pathways/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bofas-diabetic-foot-charcot",
    "section": "Foot & Ankle",
    "type": "Specialist society guidance",
    "topic": "Diabetic foot & Charcot neuroarthropathy",
    "subGroup": "Current",
    "source": "BOFAS (Hyperbook)",
    "summary": "Covers the diabetic foot including the ACUTE diabetic foot - a limb-threatening emergency. The acute red, hot, swollen diabetic foot is Charcot until proven otherwise; misdiagnosis as infection or gout leads to catastrophic collapse. Requires immediate total contact casting. Also covers diabetic ankle fractures, which have markedly higher complication rates and need modified fixation and prolonged immobilisation.",
    "notes": "BOFAS Hyperbook, Systemic section. Read alongside NICE NG19 (diabetic foot problems). CLOSES THE DIABETIC FOOT/CHARCOT GAP.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Emergencies",
      "Infection & Tumour"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URLs from BOFAS Hyperbook official navigation.",
    "versions": [
      {
        "url": "https://www.bofas.org.uk/hyperbook/systemic/diabetic-foot",
        "label": "Current"
      },
      {
        "url": "https://www.bofas.org.uk/hyperbook/home",
        "label": "Fallback / index page"
      },
      {
        "url": "https://www.bofas.org.uk/hyperbook/systemic/diabetic-foot/acute-diabetic-foot",
        "label": "Acute diabetic foot"
      },
      {
        "url": "https://www.bofas.org.uk/hyperbook/systemic/diabetic-foot/total-contact-casting",
        "label": "Total contact casting"
      },
      {
        "url": "https://www.bofas.org.uk/hyperbook/trauma/ankle-fractures/diabetic-ankle-fractures",
        "label": "Diabetic ankle fractures"
      }
    ]
  },
  {
    "id": "bofas-fame-statement",
    "section": "Foot & Ankle",
    "type": "Specialist society guidance",
    "topic": "FAME study - BOFAS position statement",
    "subGroup": "2019",
    "source": "BOFAS (Scientific Committee)",
    "summary": "BOFAS position statement responding to the FAME study, supporting early functional rehabilitation and controlled weight-bearing for acute Achilles tendon rupture over traditional plaster casting.",
    "notes": "2019. Low clinical-lookup value - included for completeness of the BOFAS catalogue.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Trauma",
      "Rehabilitation"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URL from the BOFAS official publications page.",
    "versions": [
      {
        "url": "https://www.bofas.org.uk/Portals/0/Position%20Statements/FAME%20STUDY%20POSITION%20STATEMENT.pdf",
        "label": "2019"
      },
      {
        "url": "https://www.bofas.org.uk/clinician/research/bofas-publications",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bofas-flatfoot-commissioning",
    "section": "Foot & Ankle",
    "type": "Specialist society guidance",
    "topic": "Flatfoot deformities - BOFAS commissioning guidelines",
    "subGroup": "Undated",
    "source": "BOFAS",
    "summary": "Commissioning guidance on paediatric and adult flatfoot (pes planus) deformities - referral thresholds and criteria for conservative management versus surgical reconstruction.",
    "notes": "Undated. Complements the Hyperbook pes planus page and the BSCOS flexible flatfoot consensus.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective",
      "Paediatrics",
      "Service & Commissioning"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-22",
    "linkVerificationNotes": "URL from the BOFAS official publications page. | 2026-08-22 remediation: dead primary (BOFAS Portals path, non-breaking-space encoding, HTTP 404) replaced with the verified BOA-hosted copy (HTTP 200 confirmed).",
    "versions": [
      {
        "url": "https://www.boa.ac.uk/static/83bf469d-2c6f-470b-a6ffc7f0fda8eada/acquired%20adult%20flatfoot%20deformity.pdf",
        "label": "Undated"
      },
      {
        "url": "https://www.bofas.org.uk/clinician/research/bofas-publications",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bofas-hallux-valgus",
    "section": "Foot & Ankle",
    "type": "Specialist society guidance",
    "topic": "Hallux valgus (bunion) & forefoot conditions",
    "subGroup": "Current",
    "source": "BOFAS (Hyperbook)",
    "summary": "Covers hallux valgus (including scarf vs distal osteotomy decision-making and indications - symptomatic pain not relieved by shoe modification, not cosmetic), hallux rigidus, hallux varus, lesser toe deformities and instability, Morton's neuroma, bunionette deformity, Freiberg's disease, sesamoid disorders, ingrown toenail and second MTPJ arthritis.",
    "notes": "BOFAS Hyperbook, Forefoot section. The GIRFT bunions pathway is under review, making this the best available reference. CLOSES THE HALLUX VALGUS GAP.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URLs from BOFAS Hyperbook official navigation.",
    "versions": [
      {
        "url": "https://www.bofas.org.uk/hyperbook/forefoot/hallux-valgus",
        "label": "Current"
      },
      {
        "url": "https://www.bofas.org.uk/hyperbook/home",
        "label": "Fallback / index page"
      },
      {
        "url": "https://www.bofas.org.uk",
        "label": "Morton's neuroma: /hyperbook/forefoot/mortons-neuroma (prefix"
      }
    ]
  },
  {
    "id": "nice-ankle-distraction-htg393",
    "section": "Foot & Ankle",
    "type": "National guidance",
    "topic": "Joint distraction for ankle osteoarthritis",
    "subGroup": "Published Dec 2015",
    "source": "NICE",
    "summary": "Fixing an external frame (e.g. Ilizarov) around the ankle and slightly distracting the joint to allow cartilage regrowth. Requires special governance arrangements and specialist limb reconstruction teams.",
    "notes": "HTG393 (migrated from IPG538). Published Dec 2015.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Limb Reconstruction",
      "Elective"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg393.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg393",
        "label": "Published Dec 2015"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "ankle-fracture",
    "section": "Foot & Ankle",
    "type": "Specialist society guidance",
    "topic": "Management of ankle fractures",
    "subGroup": "August 2016",
    "source": "BOA (BOASt) with BOFAS",
    "summary": "Assess soft tissues and neurovascular status; reduce and splint clinically deformed/unstable ankles urgently (skin at risk), then repeat and document the neurovascular exam. Weber pattern and talar shift guide operative vs non-operative management; restore the mortise. Non-operative pathways acceptable for over-60s; most patients weight-bear as tolerated. Beware Maisonneuve - image the whole leg if proximal fibula tenderness.",
    "notes": "August 2016. Excludes pilon, open and paediatric ankle fractures. CORRECTED: this URL previously pointed to the urological trauma document.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Trauma",
      "Emergencies"
    ],
    "priority": "medium",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "CORRECTED URL - content-verified against fetched PDF via boast-12-pdf.html. GUID transposition fixed.",
    "versions": [
      {
        "url": "https://www.boa.ac.uk/asset/F8B1C499%2DC38A%2D4805%2D8CB8D8EB3087BCA7/",
        "label": "August 2016"
      },
      {
        "url": "https://www.boa.ac.uk/standards-guidance/boasts.html",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "end-stage-ankle-arthritis",
    "section": "Foot & Ankle",
    "type": "Specialist society guidance",
    "topic": "Management of end-stage ankle arthritis (SpecS)",
    "subGroup": "April 2025",
    "source": "BOA SpecS with BOFAS",
    "summary": "Covers assessment and treatment options for end-stage ankle OA including fusion vs total ankle replacement, and non-operative measures. Outcomes may be improved by discussion in an ankle arthritis network and by concentrating Total Ankle Replacement in centres where they are regularly performed. Guides referral and shared decision-making.",
    "notes": "April 2025. Co-produced with BOFAS.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective"
    ],
    "priority": "medium",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "200 response, non-colliding GUID; April 2025 confirmed by second pass.",
    "versions": [
      {
        "url": "https://www.boa.ac.uk/asset/A811FC01-EFC3-44B7-BF6C4B0D4D4C2C85/",
        "label": "April 2025"
      },
      {
        "url": "https://www.boa.ac.uk/standards-guidance/boasts/specialty-standards-specs.html",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-hallux-mtp-replacement-htg87",
    "section": "Foot & Ankle",
    "type": "National guidance",
    "topic": "Metatarsophalangeal joint replacement of the hallux",
    "subGroup": "Published Nov 2005",
    "source": "NICE",
    "summary": "Replacing the great-toe MTP joint with an artificial joint for hallux rigidus/arthritis. High failure rates and uncertain long-term efficacy versus arthrodesis mean use only with special governance, consent and audit. Fusion remains the UK gold standard.",
    "notes": "HTG87 (migrated from IPG140). Published Nov 2005.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg87.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg87",
        "label": "Published Nov 2005"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bofas-midfoot-hindfoot",
    "section": "Foot & Ankle",
    "type": "Specialist society guidance",
    "topic": "Mid & hindfoot conditions",
    "subGroup": "Current",
    "source": "BOFAS (Hyperbook)",
    "summary": "Covers plantar fasciitis, pes planus (flat foot, including adult acquired flatfoot / tibialis posterior tendon dysfunction), cavovarus foot, midfoot arthritis, subtalar arthritis, tarsal tunnel syndrome and hindfoot arthroscopy. Stresses conservative management (orthotics, physiotherapy) before complex hindfoot reconstructive fusion.",
    "notes": "BOFAS Hyperbook, Mid & hindfoot section.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URLs from BOFAS Hyperbook official navigation.",
    "versions": [
      {
        "url": "https://www.bofas.org.uk/hyperbook/mid-hindfoot",
        "label": "Current"
      },
      {
        "url": "https://www.bofas.org.uk/hyperbook/home",
        "label": "Fallback / index page"
      },
      {
        "url": "https://www.bofas.org.uk",
        "label": "Tarsal tunnel: /hyperbook/mid-hindfoot/tarsal-tunnel-syndrome (prefix"
      }
    ]
  },
  {
    "id": "bofas-diabetic-foot-guidelines",
    "section": "Foot & Ankle",
    "type": "Specialist society guidance",
    "topic": "Multidisciplinary diabetic foot guidelines",
    "subGroup": "2016",
    "source": "BOFAS / BOA",
    "summary": "Joint BOFAS/BOA multidisciplinary guidelines on management of the diabetic foot - the diabetic foot MDT, Charcot neuroarthropathy, ulceration, infection, offloading, limb salvage and surgical management.",
    "notes": "2016. The formal guideline counterpart to the Hyperbook diabetic foot pages. Read alongside NICE NG19.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Emergencies",
      "Infection & Tumour"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URL from the BOFAS official publications page.",
    "versions": [
      {
        "url": "https://www.bofas.org.uk/Portals/0/Position%20Statements/DiabeticFoot%20FINAL.pdf",
        "label": "2016"
      },
      {
        "url": "https://www.bofas.org.uk/clinician/research/bofas-publications",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bofas-total-ankle-replacement-statement",
    "section": "Foot & Ankle",
    "type": "Specialist society guidance",
    "topic": "Total ankle replacement - BOFAS position statement",
    "subGroup": "2019",
    "source": "BOFAS (Scientific Committee)",
    "summary": "Position statement confirming modern Total Ankle Replacement is a successful and safe alternative to arthrodesis for end-stage ankle arthritis when performed in appropriate centres by specialised surgeons. Covers indications, service provision, surgeon volume and case selection.",
    "notes": "2019. Related to the PRINTAR study. Complements the BOA/BOFAS SpecS on end-stage ankle arthritis.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URL from the BOFAS official publications page.",
    "versions": [
      {
        "url": "https://www.bofas.org.uk/Portals/0/Position%20Statements/BOFAS%20Statement%20on%20TAR%20.pdf",
        "label": "2019"
      },
      {
        "url": "https://www.bofas.org.uk/clinician/research/bofas-publications",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bofas-vte-position-statement",
    "section": "Foot & Ankle",
    "type": "Specialist society guidance",
    "topic": "VTE prophylaxis in foot & ankle surgery - BOFAS position statement",
    "subGroup": "June 2025",
    "source": "BOFAS (Scientific Committee)",
    "summary": "Position statement on venous thromboembolism prophylaxis in foot and ankle surgery. Routine pharmacological prophylaxis is not required for the vast majority of foot and ankle procedures (including below-knee casting) unless specific high-risk patient factors are identified. Addresses a genuinely contested area - NICE VTE guidance for hip/knee arthroplasty does not translate directly.",
    "notes": "v1.0, June 2025 - CURRENT. Supersedes the previous BOFAS VTE statement (Sept 2017). Clinically important and commonly asked on call.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective",
      "Trauma"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URL from the BOFAS official publications page; version and date confirmed (v1.0, 2025-06).",
    "versions": [
      {
        "url": "https://www.bofas.org.uk/Portals/0/Position%20Statements/BOFAS%20VTE%20Statement%20-%20v1.0%20-%202025-06.pdf",
        "label": "June 2025"
      },
      {
        "url": "https://www.bofas.org.uk/clinician/research/bofas-publications",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bofas-weightbearing-foot-ankle",
    "section": "Foot & Ankle",
    "type": "Specialist society guidance",
    "topic": "Weight-bearing after foot & ankle surgery",
    "subGroup": "Current",
    "source": "BOFAS (Hyperbook)",
    "summary": "Guidance on weight-bearing status after foot and ankle surgery, plus post-operative rehabilitation. Complements the BOASt on mobilisation and weight-bearing and the NHFD briefing. The AUGMENT national audit found wide variation in compliance with BOAST 12 weight-bearing standards after ankle fracture fixation.",
    "notes": "BOFAS Hyperbook, Miscellaneous section.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Trauma",
      "Elective",
      "Rehabilitation"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URLs from BOFAS Hyperbook official navigation.",
    "versions": [
      {
        "url": "https://www.bofas.org.uk/hyperbook/miscellaneous/weight-bearing-after-f-a-surgery",
        "label": "Current"
      },
      {
        "url": "https://www.bofas.org.uk/hyperbook/home",
        "label": "Fallback / index page"
      },
      {
        "url": "https://www.bofas.org.uk/hyperbook/miscellaneous/post-operative-rehabilitation",
        "label": "Post-operative rehabilitation"
      }
    ]
  },
  {
    "id": "girft-carpal-tunnel",
    "section": "Hand & Wrist",
    "type": "National guidance",
    "topic": "Adult carpal tunnel syndrome",
    "subGroup": "Under review / disputed",
    "source": "GIRFT / BSSH",
    "summary": "Pathway for adult carpal tunnel syndrome, recommending WALANT decompression in minor procedure rooms rather than main theatres to increase NHS capacity. NOTE: pass 1 found this pathway listed as CURRENTLY UNDER REVIEW with no live document; pass 2 reported it as live on the GIRFT hand hub. CONFIRM STATUS MANUALLY.",
    "notes": "CONFLICT BETWEEN PASSES - pass 1 (July 2026) found 'Currently under review' on both the GIRFT pathways index and hand surgery specialty page; pass 2 (July 2026) reported it live. Check the GIRFT hand hub directly.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Elective"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "CONFLICT RESOLVED 29/07/2026: confirmed live under the Hand Surgery section of the official GIRFT pathways index as 'Currently under review - Adult carpal tunnel syndrome'. No live pathway URL. The previously-used Fallback URL (plastic-surgery-burns specialty page) was the wrong specialty page and has been replaced with the correct academy pathways index, which shows the under-review notice directly.",
    "versions": [
      {
        "url": "https://gettingitrightfirsttime.co.uk/academy-resources/pathways/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "girft-trigger-digit",
    "section": "Hand & Wrist",
    "type": "National guidance",
    "topic": "Adult trigger digit",
    "subGroup": "December 2023",
    "source": "GIRFT / BSSH",
    "summary": "High-volume low-complexity pathway for adult trigger finger/thumb - conservative management, corticosteroid injection in primary care first, escalating to surgical release under WALANT in minor procedure rooms if refractory.",
    "notes": "December 2023.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URL confirmed on two GIRFT official index pages.",
    "versions": [
      {
        "url": "https://gettingitrightfirsttime.co.uk/wp-content/uploads/2023/12/2023-12-11_Hand-surgery_Pathway_Adult-Trigger-digit.drawio.pdf",
        "label": "December 2023"
      },
      {
        "url": "https://gettingitrightfirsttime.co.uk/surgical_specialties/plastic-surgery-burns/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "girft-wrist-ganglion",
    "section": "Hand & Wrist",
    "type": "National guidance",
    "topic": "Adult wrist ganglion",
    "subGroup": "December 2023",
    "source": "GIRFT / BSSH",
    "summary": "Reassurance and conservative management as default - asymptomatic ganglia require no treatment and often resolve spontaneously. Aspiration or excision reserved for painful or mechanically restrictive cysts.",
    "notes": "December 2023.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URL confirmed on two GIRFT official index pages.",
    "versions": [
      {
        "url": "https://gettingitrightfirsttime.co.uk/wp-content/uploads/2023/12/2023-12-11_Hand-surgery_Pathway_Ganglion.drawio.pdf",
        "label": "December 2023"
      },
      {
        "url": "https://gettingitrightfirsttime.co.uk/surgical_specialties/plastic-surgery-burns/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bssh-best-guidelines",
    "section": "Hand & Wrist",
    "type": "Specialist society guidance",
    "topic": "BSSH BEST Guidelines (Evidence for Surgical Treatment)",
    "subGroup": "2023-2024",
    "source": "BSSH",
    "summary": "BSSH's evidence-based guideline series developed by independent Guideline Development Groups - systematic reviews evaluating controversial surgical treatments across common elective and traumatic hand conditions. Includes the guideline on managing thumb ulnar collateral ligament injuries (skier's/gamekeeper's thumb), published in J Hand Surg Eur Vol 2024.",
    "notes": "Ongoing series. Thumb UCL guideline published Nov 2024. Funded entirely by BSSH; GDGs work independently of BSSH Council.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Trauma",
      "Elective"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "FIXED 29/07/2026: row previously only linked the BEST index page with no individual guideline links, despite 3 published NICE-accredited BEST guidelines existing (thumb base OA, trigger digits, thumb UCL injuries). Fetched the index directly and confirmed all 3 direct PDF deep links plus the process manual and journal summaries - added above. Primary URL kept as the index (it is the correct parent page for an ongoing series), individual documents now in Additional Version Links.",
    "versions": [
      {
        "url": "https://www.bssh.ac.uk/professionals/best_guidelines.aspx",
        "label": "2023-2024"
      },
      {
        "url": "https://www.bssh.ac.uk/professionals/guidelines.aspx",
        "label": "Fallback / index page"
      },
      {
        "url": "https://www.bssh.ac.uk/_userfiles/pages/files/Research/Evidence%20based%20management%20of%20adults%20with%20thumb%20base%20osteoarthritis(1).pdf",
        "label": "Thumb base osteoarthritis"
      },
      {
        "url": "https://www.bssh.ac.uk/_userfiles/pages/files/professionals/BEST%20Guidelines/BEST%20trigger%20finger%20PUBLISHED(1).pdf",
        "label": "Adult trigger digits"
      },
      {
        "url": "https://www.bssh.ac.uk/_userfiles/pages/files/professionals/BEST%20Guidelines/BEST%20UCL%20Final.pdf",
        "label": "Thumb UCL injuries"
      },
      {
        "url": "https://www.bssh.ac.uk/_userfiles/pages/files/professionals/BEST%20Guidelines/BEST%20Process%20Manual%201st%20ed%2012th%20draft.pdf",
        "label": "BEST Process Manual"
      },
      {
        "url": "https://journals.sagepub.com/doi/full/10.1177/17531934241313206",
        "label": "Journal summaries (Thumb OA, J Hand Surg Eur 2025)"
      },
      {
        "url": "https://journals.sagepub.com/doi/full/10.1177/17531934241274612",
        "label": "Journal summary (Thumb UCL, J Hand Surg Eur 2024)"
      }
    ]
  },
  {
    "id": "bssh-hand-conditions-reference",
    "section": "Hand & Wrist",
    "type": "Specialist society guidance",
    "topic": "BSSH hand conditions reference (patient-facing, clinically useful)",
    "subGroup": "Current",
    "source": "BSSH",
    "summary": "Structured condition pages covering adult hand disorders (De Quervain's, trigger finger/thumb, ganglion cysts, carpal tunnel syndrome, cubital tunnel syndrome, basal thumb arthritis, terminal finger joint arthritis, Dupuytren's disease) and hand injuries (boutonniere, extensor tendon, flexor tendon, mallet finger, EPL rupture, hand fractures, finger dislocations, finger sprains, skier's thumb, volar plate injury, nerve injury, hand wounds, nailbed injuries, wrist sprains).",
    "notes": "Written for patients but clinically accurate and well-organised - a useful quick reference and shared decision-making aid. CLOSES GAPS: carpal tunnel, Dupuytren's, trigger finger.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective",
      "Trauma"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "All URLs from BSSH official site navigation.",
    "versions": [
      {
        "url": "https://www.bssh.ac.uk/patients/conditions/",
        "label": "Current"
      },
      {
        "url": "https://www.bssh.ac.uk/professionals/guidelines.aspx",
        "label": "Fallback / index page"
      },
      {
        "url": "https://www.bssh.ac.uk",
        "label": "Hand injuries index: /patients/conditions/hand_injuries (prefix"
      }
    ]
  },
  {
    "id": "bssh-hand-trauma-standards",
    "section": "Hand & Wrist",
    "type": "Specialist society guidance",
    "topic": "BSSH Standards of Care in Hand Trauma (all 11 standards)",
    "subGroup": "2020",
    "source": "BSSH (Trauma Committee)",
    "summary": "Eleven national standards defining timing and management for hand trauma. CORE TIMING STANDARDS: open fractures and open joints within 24 hours; bites within 24 hours; other open hand injuries within 4 days; closed hand fractures within 7 days. Covers closed hand fracture, open fracture, flexor tendon, extensor tendon, nerve trauma, revascularisation, mallet injury, animal/human bite, metacarpal neck fracture, flexor sheath infection and scaphoid fracture. Mandates management by surgeons with specialised hand training on dedicated trauma lists with ring-fenced hand therapy.",
    "notes": "BSSH 2020 (pass 2 cites 2022 for the consolidated set). These are the standards national audits (BSSH-RSTN collaborative) measure against. CLOSES GAPS: mallet finger, flexor tendon injury, boxer's fracture (metacarpal neck), flexor sheath infection.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Trauma",
      "Emergencies",
      "Service & Commissioning"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "AUDIT 29/07/2026: Topic states 'all 11 standards' but only the first ('Closed hand fractures') PDF is linked as Primary URL. The other 10 Standards of Care in Hand Trauma documents were NOT individually located this pass.",
    "versions": [
      {
        "url": "https://www.bssh.ac.uk/_userfiles/pages/files/professionals/Trauma%20standards/1%20Closed%20hand%20fractures%20final.pdf",
        "label": "2020"
      },
      {
        "url": "https://www.bssh.ac.uk/professionals/guidelines.aspx",
        "label": "Fallback / index page"
      },
      {
        "url": "https://www.bssh.ac.uk/_userfiles/pages/files/professionals/Trauma%20standards/",
        "label": "11 Scaphoid: .../Scaphoid%20standards.pdf (all prefixed"
      },
      {
        "url": "https://www.bssh.ac.uk/_userfiles/pages/files/professionals/GIRFT/GIRFT-scaphoid.pdf",
        "label": "GIRFT scaphoid companion"
      }
    ]
  },
  {
    "id": "ebi-carpal-tunnel-syndrome-release",
    "section": "Hand & Wrist",
    "type": "National guidance",
    "topic": "Carpal tunnel syndrome release",
    "source": "NHS Evidence-Based Interventions (EBI) programme / Academy of Medical Royal Colleges",
    "summary": "Statutory EBI guidance: no treatment for mild/intermittent symptoms; corticosteroid injection or night splinting first-line for symptoms interfering with sleep/activity; surgery reserved for refractory cases, permanent sensory loss, or thenar wasting/weakness. Uses the BRAN framework (Benefits, Risks, Alternatives, do Nothing) for shared decision-making.",
    "notes": "Published Jan 2019, last reviewed Sept 2024. Individual EBI intervention page (parent overview: nhs-ebi-programme). Cross-reference: GIRFT's own carpal tunnel pathway is currently under review (see girft-carpal-tunnel row) - this EBI page is the more current, live source.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Elective",
      "Quick Reference"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "CONFIRMED 29/07/2026: fetched directly, exact deep link to this specific intervention page (not the generic EBI front page). Full content read - Summary/Recommendation/Rationale/Patient information/Coding/References sections all present and current as of the page's own 'last reviewed' date.",
    "versions": [
      {
        "url": "https://ebi.aomrc.org.uk/interventions/carpal-tunnel-syndrome-release/",
        "label": "Current"
      },
      {
        "url": "https://ebi.aomrc.org.uk/specialty/musculoskeletal-spine/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bssh-crps-guidelines",
    "section": "Hand & Wrist",
    "type": "Specialist society guidance",
    "topic": "Complex regional pain syndrome (CRPS) - BSSH guidelines",
    "subGroup": "Current",
    "source": "BSSH",
    "summary": "Recognition and management of CRPS, a recognised complication after hand and wrist injury or surgery (particularly distal radius fracture). Emphasises early desensitisation, physiotherapy and pain team referral.",
    "notes": "Multidisciplinary, with the Royal Pharmaceutical Society. Complements the BOFAS Hyperbook CRPS page.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Trauma",
      "Rehabilitation"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URL from BSSH official Guidelines & Resources navigation.",
    "versions": [
      {
        "url": "https://www.bssh.ac.uk/professionals/crps_guidelines.aspx",
        "label": "Current"
      },
      {
        "url": "https://www.bssh.ac.uk/professionals/guidelines.aspx",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "girft-dupuytrens",
    "section": "Hand & Wrist",
    "type": "National guidance",
    "topic": "Dupuytren's contracture",
    "subGroup": "December 2023",
    "source": "GIRFT / BSSH",
    "summary": "Assessment, referral and management of Dupuytren's disease - conservative management, thresholds for intervention (flexion contracture of 30 degrees or more at the MCPJ, or 20 degrees at the PIPJ), rapid progression as a referral trigger, and treatment options.",
    "notes": "December 2023. Aligns with NHS EBI List criteria.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URL confirmed on two GIRFT official index pages.",
    "versions": [
      {
        "url": "https://gettingitrightfirsttime.co.uk/wp-content/uploads/2023/12/2023-12-11_Hand-surgery_Pathway_Dupuytrens.drawio.pdf",
        "label": "December 2023"
      },
      {
        "url": "https://gettingitrightfirsttime.co.uk/surgical_specialties/plastic-surgery-burns/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "ebi-dupuytrens-contracture-release",
    "section": "Hand & Wrist",
    "type": "National guidance",
    "topic": "Dupuytren's contracture release in adults",
    "source": "NHS Evidence-Based Interventions (EBI) programme / Academy of Medical Royal Colleges",
    "summary": "Statutory EBI guidance: intervention (needle fasciotomy, fasciectomy, dermofasciectomy) should be considered only for contractures significantly impairing hand function, never for cosmetic purposes; radiotherapy not recommended. Uses the BRAN framework (Benefits, Risks, Alternatives, do Nothing) for shared decision-making.",
    "notes": "Published Jan 2019, last reviewed Sept 2024. Individual EBI intervention page (parent overview: nhs-ebi-programme). Links an NHS England shared decision-making aid.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Elective"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "CONFIRMED 29/07/2026: fetched directly, exact deep link to this specific intervention page (not the generic EBI front page). Full content read - Summary/Recommendation/Rationale/Patient information/Coding/References sections all present and current as of the page's own 'last reviewed' date.",
    "versions": [
      {
        "url": "https://ebi.aomrc.org.uk/interventions/dupuytrens-contracture-release-in-adults/",
        "label": "Current"
      },
      {
        "url": "https://ebi.aomrc.org.uk/specialty/musculoskeletal-spine/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "ebi-ganglion-excision",
    "section": "Hand & Wrist",
    "type": "National guidance",
    "topic": "Ganglion excision",
    "source": "NHS Evidence-Based Interventions (EBI) programme / Academy of Medical Royal Colleges",
    "summary": "Statutory EBI guidance: most wrist ganglia need no treatment; aspiration first for symptomatic ones; surgical excision only if aspiration fails and hand function remains restricted. Uses the BRAN framework (Benefits, Risks, Alternatives, do Nothing) for shared decision-making.",
    "notes": "Published Jan 2019, last reviewed Sept 2024. Individual EBI intervention page (parent overview: nhs-ebi-programme).",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Elective"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "CONFIRMED 29/07/2026: fetched directly, exact deep link to this specific intervention page (not the generic EBI front page). Full content read - Summary/Recommendation/Rationale/Patient information/Coding/References sections all present and current as of the page's own 'last reviewed' date.",
    "versions": [
      {
        "url": "https://ebi.aomrc.org.uk/interventions/ganglion-excision/",
        "label": "Current"
      },
      {
        "url": "https://ebi.aomrc.org.uk/specialty/musculoskeletal-spine/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "girft-bite-wounds-pathway",
    "section": "Hand & Wrist",
    "type": "National guidance",
    "topic": "Hand bite wounds (incl. fight bite)",
    "subGroup": "May 2022",
    "source": "GIRFT / BSSH",
    "summary": "Remove rings; if dermis breached start antibiotics per local guidelines, irrigate copiously with tap water, photograph the cleaned wound, non-adherent dressing, X-ray if indicated. Consider tetanus, rabies (animal bites), safeguarding and blood-borne virus prophylaxis for human bites. RED FLAGS - sepsis, signs of infection, open fracture, potential open joint or vascular compromise: immediate surgical review plus IV antibiotics. Debridement within 24 hours of specialist review; splint in Position of Safe Immobilisation if mobilisation delayed. Otherwise review within 24 hours by a clinician experienced in bites. High risk of septic arthritis in MCPJ fight bites.",
    "notes": "Version 1, May 2022. CLOSES THE FIGHT BITE GAP.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Emergencies",
      "Infection & Tumour"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified against fetched PDF - covers human bites, open joint, BBV prophylaxis.",
    "versions": [
      {
        "url": "https://gettingitrightfirsttime.co.uk/wp-content/uploads/2022/05/Hand-surgery_2022-05-13_Pathway_Bite-wounds.pdf",
        "label": "May 2022"
      },
      {
        "url": "https://gettingitrightfirsttime.co.uk/surgical_specialties/plastic-surgery-burns/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "girft-hand-lacerations",
    "section": "Hand & Wrist",
    "type": "National guidance",
    "topic": "Hand lacerations and cuts",
    "subGroup": "December 2023",
    "source": "GIRFT / BSSH",
    "summary": "Assessment and management of hand lacerations including assessment for tendon, nerve and vascular injury, wound exploration, and triage of simple vs complex lacerations to minor procedure rooms or main theatres.",
    "notes": "December 2023.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Emergencies",
      "Trauma"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URL confirmed on two GIRFT official index pages.",
    "versions": [
      {
        "url": "https://gettingitrightfirsttime.co.uk/wp-content/uploads/2023/12/2023-12-11_Hand-surgery_Pathway_Hand-lacerations-or-cuts.drawio.pdf",
        "label": "December 2023"
      },
      {
        "url": "https://gettingitrightfirsttime.co.uk/surgical_specialties/plastic-surgery-burns/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "girft-hand-surgery-outside-theatres",
    "section": "Hand & Wrist",
    "type": "National guidance",
    "topic": "Hand surgery outside main theatres - guidance",
    "subGroup": "August 2022",
    "source": "GIRFT / BSSH",
    "summary": "Safety, governance and infrastructure requirements for performing hand surgery outside the main theatre environment (procedure rooms, WALANT settings), covering facility standards, patient selection and governance. Key document for clinical directors moving HVLC hand work out of main theatres.",
    "notes": "August 2022. Operational/service guidance rather than clinical decision support.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective",
      "Local Overlay",
      "Service & Commissioning"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URL confirmed on the GIRFT hand surgery specialty page.",
    "versions": [
      {
        "url": "https://gettingitrightfirsttime.co.uk/wp-content/uploads/2022/08/2022-08-09_Hand-surgery_Guidance_Hand-surgery-outside-of-main-theatres.pdf",
        "label": "August 2022"
      },
      {
        "url": "https://gettingitrightfirsttime.co.uk/surgical_specialties/plastic-surgery-burns/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "distal-radius-fracture",
    "section": "Hand & Wrist",
    "type": "Specialist society guidance",
    "topic": "Management of distal radial fractures",
    "subGroup": "December 2017",
    "source": "BOA (BOASt)",
    "summary": "Assess neurovascular status (watch for acute median nerve compression), provide analgesia, and reduce displaced fractures using regional anaesthesia (not local haematoma block). Aim of treatment is to optimise functional recovery rather than achieve specific radiological parameters. In patients 65+, non-operative treatment can be considered for dorsally displaced fractures. Beware evolving carpal tunnel after reduction.",
    "notes": "December 2017. Read alongside the NICE-accredited BSSH distal radial fracture guideline (2023).",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Trauma"
    ],
    "priority": "medium",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified against fetched PDF.",
    "versions": [
      {
        "url": "https://www.boa.ac.uk/asset/ECA9B368%2D6C1D%2D4A44%2DB98DE7CFC9247273/",
        "label": "December 2017"
      },
      {
        "url": "https://www.boa.ac.uk/standards-guidance/boasts.html",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bssh-distal-radial-fractures",
    "section": "Hand & Wrist",
    "type": "Specialist society guidance",
    "topic": "Management of distal radial fractures - BSSH guideline (NICE-accredited)",
    "subGroup": "December 2023",
    "source": "BSSH",
    "summary": "BSSH's comprehensive distal radius fracture guideline, structured by care setting: Emergency Department, Fracture Clinic, Surgery, Rehabilitation, Outcome Measures and Fragility Fractures. Outlines patient selection for conservative casting versus operative fixation (volar locking plates or K-wires). Includes a Summary of Audit Standards.",
    "notes": "Published December 2023; NICE accreditation announced April 2024. A NICE-ACCREDITED society guideline - higher evidential standing than most society documents. Complements BOASt distal radial fractures (2017).",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Trauma",
      "Bone Health"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "All URLs from BSSH official Guidelines & Resources navigation.",
    "versions": [
      {
        "url": "https://www.bssh.ac.uk/professionals/management_of_distal_radial_fractures.aspx",
        "label": "December 2023"
      },
      {
        "url": "https://www.bssh.ac.uk/professionals/guidelines.aspx",
        "label": "Fallback / index page"
      },
      {
        "url": "https://www.bssh.ac.uk",
        "label": "Fragility fractures: /professionals/drfs_fragility_fractures.aspx (prefix"
      }
    ]
  },
  {
    "id": "nice-mcp-ip-replacement-htg66",
    "section": "Hand & Wrist",
    "type": "National guidance",
    "topic": "MCP & IP joint replacement for end-stage arthritis",
    "subGroup": "Published Feb 2005",
    "source": "NICE",
    "summary": "Replacing diseased metacarpophalangeal and interphalangeal finger joints with artificial ones (silicone or pyrocarbon) in severe rheumatoid or osteoarthritis, under standard clinical governance with audit.",
    "notes": "HTG66 (migrated from IPG110). Published Feb 2005.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg66.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg66",
        "label": "Published Feb 2005"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "girft-plastic-hand-burn-report",
    "section": "Hand & Wrist",
    "type": "National guidance",
    "topic": "Plastic surgery, hand surgery & burn care - GIRFT national specialty report",
    "subGroup": "August 2024",
    "source": "GIRFT (NHS England)",
    "summary": "National specialty report by Ken Dunn focused on access to services. The parent report behind the BSSH/GIRFT hand surgery pathways. Notes hand surgery services are split between orthopaedic and plastic surgery departments, often in hub-and-spoke models, and recommends shifting HVLC hand procedures out of main theatres.",
    "notes": "August 2024. Full PDF sits behind FutureNHS login; the executive summary is freely accessible.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Local Overlay",
      "Service & Commissioning"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Exec summary URL confirmed on the GIRFT specialty page; full report requires FutureNHS login.",
    "versions": [
      {
        "url": "https://gettingitrightfirsttime.co.uk/wp-content/uploads/2025/06/PSHSBC-GIRFT-report-Aug24i-Exec-summary.pdf",
        "label": "August 2024"
      },
      {
        "url": "https://gettingitrightfirsttime.co.uk/surgical_specialties/plastic-surgery-burns/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "girft-scaphoid-fracture-pathway",
    "section": "Hand & Wrist",
    "type": "National guidance",
    "topic": "Scaphoid fracture - pathway",
    "subGroup": "April 2024",
    "source": "GIRFT / BSSH",
    "summary": "Decision-tree pathway from presentation to union. Scaphoid radiographs first; if fracture not visible, urgent MRI (or CT per local ED policy) with review in 1 week - do not simply discharge the clinically suspicious 'normal X-ray' wrist. Surgical fixation for waist fractures with over 2mm displacement and proximal pole fractures with any displacement. Undisplaced: below-elbow cast 6-8 weeks, assess union clinically and with radiographs/CT (over 50% union on CT). Tubercle fractures: immobilise 4-6 weeks, discharge with PIFU. Watch for perilunate injury and associated displaced distal radius fracture.",
    "notes": "FINAL V1, April 2024. CLOSES THE SCAPHOID GAP that was stuck because bssh.ac.uk was the assumed source. Pair with BSSH Trauma Standard 11.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Trauma",
      "Emergencies"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified against fetched PDF - full decision tree confirmed.",
    "versions": [
      {
        "url": "https://gettingitrightfirsttime.co.uk/wp-content/uploads/2024/04/Hand-surgery_Scaphoid-fractures_Pathway_FINAL_V1_April-2024.pdf",
        "label": "April 2024"
      },
      {
        "url": "https://gettingitrightfirsttime.co.uk/surgical_specialties/plastic-surgery-burns/",
        "label": "Fallback / index page"
      },
      {
        "url": "https://www.bssh.ac.uk/_userfiles/pages/files/professionals/GIRFT/GIRFT-scaphoid.pdf",
        "label": "BSSH-hosted copy"
      }
    ]
  },
  {
    "id": "nice-druj-replacement-htg451",
    "section": "Hand & Wrist",
    "type": "National guidance",
    "topic": "Total distal radioulnar joint (DRUJ) replacement for instability/arthritis",
    "subGroup": "Published Nov 2017",
    "source": "NICE",
    "summary": "Removing the distal ulna and replacing it with a metal prosthesis anchored to the distal radius, for symptomatic DRUJ instability or arthritis where Darrach's or Sauve-Kapandji are unsuitable or have failed. Aims to increase joint stability and pain-free movement.",
    "notes": "HTG451 (migrated from IPG595). Published Nov 2017.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg451.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg451",
        "label": "Published Nov 2017"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-total-wrist-replacement-htg173",
    "section": "Hand & Wrist",
    "type": "National guidance",
    "topic": "Total wrist replacement",
    "subGroup": "Published Aug 2008",
    "source": "NICE",
    "summary": "Creating an artificial wrist joint from metal implants anchored to the forearm and hand, separated by a spacer, for end-stage arthritis. Must be performed by surgeons with specialist hand/wrist arthroplasty training.",
    "notes": "HTG173 (migrated from IPG271). Published Aug 2008.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg173.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg173",
        "label": "Published Aug 2008"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-tmc-replacement-htg67",
    "section": "Hand & Wrist",
    "type": "National guidance",
    "topic": "Trapeziometacarpal joint replacement for end-stage OA",
    "subGroup": "Published Feb 2005",
    "source": "NICE",
    "summary": "Replacing the arthritic joint at the base of the thumb with an artificial joint. Trapeziectomy remains the gold standard, but replacement is an acceptable alternative for maintaining thumb length and pinch grip.",
    "notes": "HTG67 (migrated from IPG111). Published Feb 2005.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg67.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg67",
        "label": "Published Feb 2005"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "girft-traumatic-amputation-hand",
    "section": "Hand & Wrist",
    "type": "National guidance",
    "topic": "Traumatic amputations of the digits, hand and wrist",
    "subGroup": "March 2022",
    "source": "GIRFT / BSSH",
    "summary": "Management of traumatic digit, hand and wrist amputations - initial ED management, preservation of the amputated part, replantation decision-making, immediate antibiotic and tetanus prophylaxis, and rapid transfer to regional replantation centres.",
    "notes": "March 2022.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Emergencies",
      "Trauma"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URL confirmed on two GIRFT official index pages.",
    "versions": [
      {
        "url": "https://gettingitrightfirsttime.co.uk/wp-content/uploads/2022/05/Hand-surgery_2022-03-21_Pathway_Traumatic-amputations-of-the-digits-hand-and-wrist.pdf",
        "label": "March 2022"
      },
      {
        "url": "https://gettingitrightfirsttime.co.uk/surgical_specialties/plastic-surgery-burns/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "ebi-trigger-finger-release",
    "section": "Hand & Wrist",
    "type": "National guidance",
    "topic": "Trigger finger release in adults",
    "source": "NHS Evidence-Based Interventions (EBI) programme / Academy of Medical Royal Colleges",
    "summary": "Statutory EBI guidance: mild cases need no treatment; steroid injection or splinting first-line; surgery considered if triggering persists/recurs, the finger is permanently locked, there have been 2 prior unsuccessful non-op treatments elsewhere, or the patient is diabetic. Uses the BRAN framework (Benefits, Risks, Alternatives, do Nothing) for shared decision-making.",
    "notes": "Published Jan 2019, last reviewed Sept 2024. Individual EBI intervention page (parent overview: nhs-ebi-programme).",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Elective"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "CONFIRMED 29/07/2026: fetched directly, exact deep link to this specific intervention page (not the generic EBI front page). Full content read - Summary/Recommendation/Rationale/Patient information/Coding/References sections all present and current as of the page's own 'last reviewed' date.",
    "versions": [
      {
        "url": "https://ebi.aomrc.org.uk/interventions/trigger-finger-release-in-adults/",
        "label": "Current"
      },
      {
        "url": "https://ebi.aomrc.org.uk/specialty/musculoskeletal-spine/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bssh-vte-guidelines",
    "section": "Hand & Wrist",
    "type": "Specialist society guidance",
    "topic": "VTE prophylaxis in hand surgery - BSSH guidelines",
    "subGroup": "Current",
    "source": "BSSH",
    "summary": "BSSH guidance on venous thromboembolism prophylaxis in hand surgery. Routine chemical VTE prophylaxis is unnecessary for elective upper limb and hand surgery due to immediate functional mobilisation. Complements the BOFAS VTE position statement - risk and thresholds differ substantially from hip/knee arthroplasty.",
    "notes": "Hosted in BSSH Guidelines & Resources.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective",
      "Trauma"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URL from BSSH official Guidelines & Resources navigation.",
    "versions": [
      {
        "url": "https://www.bssh.ac.uk/professionals/vte_guidelines.aspx",
        "label": "Current"
      },
      {
        "url": "https://www.bssh.ac.uk/professionals/guidelines.aspx",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bssh-walant-anaesthesia",
    "section": "Hand & Wrist",
    "type": "Specialist society guidance",
    "topic": "WALANT & regional anaesthesia in hand surgery",
    "subGroup": "Current",
    "source": "BSSH",
    "summary": "BSSH resources on anaesthesia techniques for hand surgery including WALANT (Wide Awake Local Anaesthesia No Tourniquet) and regional anaesthesia. Confirms the safety of lidocaine with adrenaline in digital blocks. WALANT enables many hand procedures outside main theatres - relevant to the GIRFT 'hand surgery outside main theatres' guidance.",
    "notes": "WALANT use expanded significantly post-pandemic. Practical, procedure-enabling guidance.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URLs from BSSH official Guidelines & Resources navigation.",
    "versions": [
      {
        "url": "https://www.bssh.ac.uk/professionals/walant.aspx",
        "label": "Current"
      },
      {
        "url": "https://www.bssh.ac.uk/professionals/guidelines.aspx",
        "label": "Fallback / index page"
      },
      {
        "url": "https://www.bssh.ac.uk/professionals/anaesthesia.aspx",
        "label": "Anaesthesia techniques"
      },
      {
        "url": "https://www.bssh.ac.uk/professionals/regional_anaesthesia.aspx",
        "label": "Regional anaesthesia"
      }
    ]
  },
  {
    "id": "acute-periprosthetic-joint-infection",
    "section": "Infection & Tumour",
    "type": "Specialist society guidance",
    "topic": "Acute peri-prosthetic joint infection (PJI)",
    "subGroup": "October 2023",
    "source": "BOA (BOASt)",
    "summary": "Suspect PJI in a hot, painful or discharging joint replacement. If septic: sepsis six, urgent blood cultures then antibiotics, emergent drainage (within 6 hours where possible). If not septic, do NOT give antibiotics until deep tissue samples are taken - 5 separate samples using no-touch technique. Consultant review of stable patients within 48 hours.",
    "notes": "October 2023. Complements the BOA SpecS 'Peri-prosthetic Joint Infection' (definitive management).",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective",
      "Emergencies"
    ],
    "priority": "high",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified against fetched PDF.",
    "versions": [
      {
        "url": "https://www.boa.ac.uk/asset/1D7D2F54%2D34B7%2D4C96%2D8A0EB80BAE3E3A07/",
        "label": "October 2023"
      },
      {
        "url": "https://www.boa.ac.uk/standards-guidance/boasts.html",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bajir-infection-registry",
    "section": "Infection & Tumour",
    "type": "Specialist society guidance",
    "topic": "BAJIR - UK Bone and Joint Infection Registry",
    "subGroup": "Current",
    "source": "BAJIS / BAJIR",
    "summary": "The UK Bone and Joint Infection Registry, collecting data on all patients with bone and joint infections nationally to track surgical outcomes, antibiotic protocols and recurrence rates. Formerly the UK PJI Group. Aims to form consensus statements on diagnosis and treatment of periprosthetic infection in the UK.",
    "notes": "Registry/audit infrastructure, not clinical guidance. WORTH RE-CHECKING PERIODICALLY - the body most likely to publish the UK's first native orthopaedic infection consensus.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Local Overlay",
      "Service & Commissioning"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URL confirmed via the BAJIS homepage.",
    "versions": [
      {
        "url": "https://bajir.org/",
        "label": "Current"
      },
      {
        "url": "https://bajis.org/",
        "label": "Fallback / index page"
      },
      {
        "url": "https://bajir.org/uk-pji-group/",
        "label": "UK PJI Group (predecessor)"
      }
    ]
  },
  {
    "id": "bajis-professional-resources",
    "section": "Infection & Tumour",
    "type": "Specialist society guidance",
    "topic": "BAJIS professional resources - orthopaedic infection guideline hub",
    "subGroup": "Updated March 2026",
    "source": "BAJIS (Bone & Joint Infection Society)",
    "summary": "BAJIS curates the UK's orthopaedic infection guidance in one place rather than publishing its own. Links: BOA BOASts on acute PJI (2023), fracture-related infection (2019) and children with acute MSK infection (2022); the British Hip Society PJI document (2020); the BASK knee PJI document (2020); the eLfH PJI training programme; and the INFORM clinician resources from Bristol. Multidisciplinary - orthopaedics, microbiology, ID, nursing/pharmacy/AHP, plastics, radiology - and affiliated to the BOA.",
    "notes": "IMPORTANT: BAJIS PUBLISHES NO GUIDELINES OF ITS OWN (as of July 2026). Founded June 2023 out of the UKPJI meeting series. This page is a curated index - the same job this hub does, for infection specifically; worth reviewing as prior art. NOTE: BAJIS hosts an OUTDATED copy of the BHS PJI standard - use the BHS canonical URL instead.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Emergencies",
      "Elective"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-22",
    "linkVerificationNotes": "Content-verified - full Professional Resources page fetched and read; no original BAJIS guidelines exist. | 2026-08-22 remediation: removed the dead 'Fallback / index page' link (bajis.org/guidelines, HTTP 404); working primary preserved.",
    "versions": [
      {
        "url": "https://bajis.org/index.php/professional-resources/",
        "label": "Updated March 2026"
      },
      {
        "url": "https://www.e-lfh.org.uk/programmes/guidelines-for-the-management-and-treatment-of-periprosthetic-joint-infection-programme/",
        "label": "eLfH PJI training programme"
      },
      {
        "url": "https://inform.bristol.ac.uk/resources-for-clinicians/",
        "label": "INFORM clinician resources (Bristol)"
      }
    ]
  },
  {
    "id": "ebjis-peripheral-bone-infection-adults",
    "section": "Infection & Tumour",
    "type": "Specialist society guidance",
    "topic": "Diagnosis of peripheral bone infection (osteomyelitis / osteitis) in adults",
    "subGroup": "2019",
    "source": "EANM / EBJIS / ESR (ESCMID endorsed)",
    "summary": "The evidence-based consensus on diagnosing adult peripheral bone infection - the document that fills the UK's adult osteomyelitis void. Built from a systematic review across infectious disease, microbiology, orthopaedic, radiological and nuclear medicine literature with PICO-structured questions. Provides a stepwise initial diagnostic pathway and evaluates the diagnostic accuracy of each imaging modality. KEY: there is NOT enough evidence to rank one advanced imaging technique above another - choice depends on local expertise, cost, availability and radiation burden. Serological tests are more informative as a trend than a single value. Incidence under 2%/year generally, 2-4% after surgical care of an open or closed fracture, rising to ~19% in acute contaminated open fractures with soft tissue injury.",
    "notes": "Glaudemans et al., Eur J Nucl Med Mol Imaging 2019;46(4):957-970. DOI 10.1007/s00259-019-4262-x. CLOSES THE ADULT OSTEOMYELITIS GAP - no UK body publishes equivalent guidance. FREE FULL TEXT on PMC. FLAG CLEARLY IN THE HUB AS EUROPEAN, NOT UK, GUIDANCE.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Trauma",
      "Emergencies"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Publication confirmed (PubMed 30675635); open-access full text on PMC6450853; cited by GPnotebook as the reference standard for chronic osteomyelitis imaging.",
    "versions": [
      {
        "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC6450853/",
        "label": "2019"
      },
      {
        "url": "https://link.springer.com/article/10.1007/s00259-019-4262-x",
        "label": "Fallback / index page"
      },
      {
        "url": "https://pubmed.ncbi.nlm.nih.gov/30675635/",
        "label": "PubMed"
      }
    ]
  },
  {
    "id": "fracture-related-infection",
    "section": "Infection & Tumour",
    "type": "Specialist society guidance",
    "topic": "Fracture-related infection (FRI)",
    "subGroup": "Updated September 2019",
    "source": "BOA (BOASt)",
    "summary": "Suspect FRI where a fracture wound shows discharge, dehiscence, or non-union with pain/systemic signs. Differentiates early vs late FRI. Sample before antibiotics - empiric antibiotics without diagnostic work-up should not be given. Multidisciplinary approach involving ortho-plastic surgeons, microbiology and infectious diseases. Early recognition improves limb salvage and union rates.",
    "notes": "Updated September 2019.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Trauma"
    ],
    "priority": "medium",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "200 response, non-colliding GUID. Content-check pending.",
    "versions": [
      {
        "url": "https://www.boa.ac.uk/asset/DEE7CBA7-5919-4F26-A286033FCF46A458/",
        "label": "Updated September 2019"
      },
      {
        "url": "https://www.boa.ac.uk/standards-guidance/boasts.html",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bhs-periprosthetic-joint-infection",
    "section": "Infection & Tumour",
    "type": "Specialist society guidance",
    "topic": "Investigation and management of periprosthetic joint infection (hip)",
    "subGroup": "2020/2022",
    "source": "British Hip Society / BOA",
    "summary": "BHS guidance on investigating and managing PJI in hip replacement - diagnostic pathway (joint aspiration, white cell counts, serum markers) and surgical treatment algorithms. The hip counterpart to the BOA/BASK knee PJI document.",
    "notes": "2020/2022. CORRECTION APPLIED: BAJIS hosts an OUTDATED copy at bajis.org/wp-content/uploads/2026/03/BHSSS-PJI.pdf - use the BHS canonical URL below.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Hip",
      "Elective"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Canonical BHS URL used in place of the stale BAJIS mirror.",
    "versions": [
      {
        "url": "https://britishhipsociety.com/Portals/0/Downloads/Revision-Hip-Network/BHSSS-PJI.pdf",
        "label": "2020/2022"
      },
      {
        "url": "https://britishhipsociety.com/resources/",
        "label": "Fallback / index page"
      },
      {
        "url": "http://bajis.org/wp-content/uploads/2026/03/BHSSS-PJI.pdf",
        "label": "Stale BAJIS mirror (DO NOT USE)"
      }
    ]
  },
  {
    "id": "boos-metastatic-bone-disease-policy",
    "section": "Infection & Tumour",
    "type": "Specialist society guidance",
    "topic": "Metastatic bone disease - a guide to good practice",
    "subGroup": "2016",
    "source": "BOOS / BOA",
    "summary": "The original BOOS/BOA metastatic bone disease guidance (Tillman & Ashford, eds). Management should involve an MDT including an orthopaedic surgeon; distal femoral, proximal tibial metaphyseal or periarticular lesions should be discussed with a local tumour centre; complex acetabular defects (Harrington type IV) require a dedicated orthopaedic oncology surgeon. Surgery should outlast the patient and permit immediate weight-bearing. Ensures urgent radiotherapy or stabilisation to maintain independence.",
    "notes": "2015/2016. The parent document behind the 2022 BOASt on MBD. The BOOM audit (BJJ 2023;105-B(10), 84 hospitals, 1,137 patients) found UK practice does NOT comply with these guidelines. Hosted on baso.org.uk.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Trauma",
      "Emergencies"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URL listed on the BOOS official Guidelines page.",
    "versions": [
      {
        "url": "https://baso.org.uk/media/61543/boos_mbd_2016_boa.pdf",
        "label": "2016"
      },
      {
        "url": "https://www.boa.ac.uk/standards-guidance/boasts.html",
        "label": "Fallback / index page"
      },
      {
        "url": "https://www.boa.ac.uk/asset/B047D54A%2D170C%2D4C57%2D87C9C5DFAC4641E7/",
        "label": "BOASt - Management of MBD (2022)"
      }
    ]
  },
  {
    "id": "metastatic-bone-disease",
    "section": "Infection & Tumour",
    "type": "Specialist society guidance",
    "topic": "Metastatic bone disease / pathological fracture",
    "subGroup": "June 2022",
    "source": "BOA (BOASt)",
    "summary": "Suspect MBD with low-energy fracture in non-osteoporotic patients, night pain or insidious pain - document circumstances and investigate (bloods incl. myeloma screen/PSA, whole-bone radiographs, CT-TAP). Radiographic features of a primary bone tumour need referral to a bone sarcoma centre within 72 hours; biopsy only at a sarcoma centre. Consultant-led surgery that outlasts the patient and allows immediate weight-bearing.",
    "notes": "June 2022. Excludes spinal metastases and osteoporotic/stress fractures. Parent document is the BOOS/BOA MBD guide.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Trauma",
      "Emergencies"
    ],
    "priority": "high",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified against fetched PDF.",
    "versions": [
      {
        "url": "https://www.boa.ac.uk/asset/B047D54A%2D170C%2D4C57%2D87C9C5DFAC4641E7/",
        "label": "June 2022"
      },
      {
        "url": "https://www.boa.ac.uk/standards-guidance/boasts.html",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "msk-soft-tissue-infection-nec-fasc",
    "section": "Infection & Tumour",
    "type": "Specialist society guidance",
    "topic": "MSK soft tissue infection incl. necrotising fasciitis / native joint infection",
    "subGroup": "July 2025",
    "source": "BOA (BOASt)",
    "summary": "Covers life-threatening necrotising fasciitis/myositis, native large-joint infection, abscess and cellulitis. Nec fasc is a surgical emergency - sepsis six, broad-spectrum antibiotics, urgent radical debridement (do not delay for imaging or transfer); take multiple deep tissue samples. Amputation decision requires two consultants.",
    "notes": "July 2025 - consolidates several infection topics. Excludes fracture-related and peri-prosthetic joint infection (separate BOASts).",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Emergencies",
      "Trauma"
    ],
    "priority": "high",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified against fetched PDF; July 2025 confirmed by both passes.",
    "versions": [
      {
        "url": "https://www.boa.ac.uk/asset/A04FA82B%2D859C%2D44C7%2D96F76BB381637E30/",
        "label": "July 2025"
      },
      {
        "url": "https://www.boa.ac.uk/standards-guidance/boasts.html",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "periprosthetic-joint-infection-specs",
    "section": "Infection & Tumour",
    "type": "Specialist society guidance",
    "topic": "Peri-prosthetic joint infection (SpecS - definitive management)",
    "subGroup": "April 2024",
    "source": "BOA SpecS",
    "summary": "The specialty-level pathway for definitive PJI management following on from the acute Clinical BOASt, including single vs two-stage revision decision-making. Definitive treatment requires coordinated multidisciplinary input from specialist infection treatment centres, irrespective of anatomical site.",
    "notes": "April 2024. Second pass confirmed a URL migration in April 2024 - use the SpecS repository if the asset link fails.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective"
    ],
    "priority": "medium",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "200 response; second pass flagged April 2024 migration. Confirm asset resolves before injection.",
    "versions": [
      {
        "url": "https://www.boa.ac.uk/asset/81DC4130-D980-432E-8A0EB61A60E73CF3/",
        "label": "April 2024"
      },
      {
        "url": "https://www.boa.ac.uk/standards-guidance/boasts/specialty-standards-specs.html",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bess-pji-shoulder-elbow",
    "section": "Infection & Tumour",
    "type": "Specialist society guidance",
    "topic": "Periprosthetic joint infection in the shoulder and elbow",
    "subGroup": "August 2018",
    "source": "BESS / BOA",
    "summary": "Investigation and management of PJI in shoulder and elbow arthroplasty. Cutibacterium acnes is the most common pathogen in shoulder PJI - slow-growing, requiring extended culture (up to 14 days). A key difference from hip/knee PJI.",
    "notes": "August 2018, written in conjunction with the BOA. Complements the BOA PJI BOASt and SpecS (hip/knee focused).",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Shoulder & Elbow",
      "Elective"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URL confirmed on the BESS official pathways index page.",
    "versions": [
      {
        "url": "https://bess.ac.uk/wp-content/uploads/2020/06/BESS-PJI-guidance-Aug-2018.pdf",
        "label": "August 2018"
      },
      {
        "url": "https://bess.ac.uk/patient-care-pathways-and-guidelines/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bsg-bone-sarcoma-guidelines",
    "section": "Infection & Tumour",
    "type": "Specialist society guidance",
    "topic": "UK guidelines for the management of bone sarcomas",
    "subGroup": "November 2024",
    "source": "British Sarcoma Group (BSG)",
    "summary": "Reference standard for UK clinical care of primary malignant bone tumours (osteosarcoma, Ewing, chondrosarcoma) and giant cell tumours of bone. KEY: bone pain or a palpable mass must ALWAYS trigger further investigation; suspected primary bone tumour at any site requires referral to a specialist centre and management by an accredited bone sarcoma MDT. Provides treatment recommendations by tumour type and for localised, metastatic and recurrent disease, plus follow-up schedules.",
    "notes": "CORRECTION APPLIED: BOOS links only the 2016 version, but a 2024 UPDATE exists (British Journal of Cancer, DOI 10.1038/s41416-024-02868-4) - BOOS's own curated link is STALE. Use the 2024 update as primary.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Paediatrics",
      "Trauma",
      "Imaging"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "2024 publication confirmed via DOI in pass 2; 2016 version retained as a superseded version link.",
    "versions": [
      {
        "url": "https://doi.org/10.1038/s41416-024-02868-4",
        "label": "November 2024"
      },
      {
        "url": "https://britishsarcomagroup.org.uk/guidelines/",
        "label": "Fallback / index page"
      },
      {
        "url": "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11723950/",
        "label": "2024 open access (PMC)"
      },
      {
        "url": "https://clinicalsarcomaresearch.biomedcentral.com/articles/10.1186/s13569-016-0047-1",
        "label": "2016 superseded version (as linked by BOOS)"
      }
    ]
  },
  {
    "id": "bsg-soft-tissue-sarcoma-guidelines",
    "section": "Infection & Tumour",
    "type": "Specialist society guidance",
    "topic": "UK guidelines for the management of soft tissue sarcomas",
    "subGroup": "2024",
    "source": "British Sarcoma Group (BSG)",
    "summary": "UK reference standard for soft tissue sarcoma - recognition, referral, diagnosis and treatment, establishing the framework for multidisciplinary management, specialist surgical excision and radiotherapy. Companion to the bone sarcoma guidelines.",
    "notes": "Pass 1 found only the 2016 version; pass 2 confirmed a 2024 update (British Journal of Cancer, DOI 10.1038/s41416-024-02674-y). Use the 2024 version.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "2024 DOI confirmed in pass 2; 2016 version retained as superseded.",
    "versions": [
      {
        "url": "https://doi.org/10.1038/s41416-024-02674-y",
        "label": "2024"
      },
      {
        "url": "https://britishsarcomagroup.org.uk/guidelines/",
        "label": "Fallback / index page"
      },
      {
        "url": "https://clinicalsarcomaresearch.biomedcentral.com/articles/10.1186/s13569-016-0060-4",
        "label": "2016 superseded"
      }
    ]
  },
  {
    "id": "bsg-ultrasound-soft-tissue-masses",
    "section": "Infection & Tumour",
    "type": "Specialist society guidance",
    "topic": "Ultrasound screening of soft tissue masses in trunk and extremity",
    "subGroup": "January 2019",
    "source": "British Sarcoma Group (BSG)",
    "summary": "Guidance on using ultrasound to screen soft tissue masses in the trunk and extremities - practical for the 'lump in the limb' referral, a common and easily mishandled presentation. Any unexplained soft tissue mass over 5cm or deep to the fascia must be treated as suspected sarcoma and urgently referred.",
    "notes": "January 2019.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Imaging",
      "Emergencies"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-23",
    "linkVerificationNotes": "PDF URL listed on the BOOS official Guidelines page; hosted on britishsarcomagroup.org.uk. | 2026-08-23 remediation: dead primary (HTTP 404) replaced. Same document, same filename, re-uploaded by British Sarcoma Group under a new WordPress date folder (2019/01 -> 2026/02). New URL confirmed HTTP 200.",
    "versions": [
      {
        "url": "https://britishsarcomagroup.org.uk/wp-content/uploads/2026/02/BSG-guidance-for-ultrasound-screening-of-soft-tissue-masses-in-the-trunk-and-extremity-FINAL-Jan-2019.pdf",
        "label": "January 2019"
      },
      {
        "url": "https://britishsarcomagroup.org.uk/guidelines/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-aci-chondrosphere-ta508",
    "section": "Knee",
    "type": "National guidance",
    "topic": "ACI using chondrosphere (Spherox) for articular cartilage defects of the knee",
    "subGroup": "Published March 2018",
    "source": "NICE",
    "summary": "ACI using chondrosphere (Spherox) for symptomatic articular cartilage defects of the knee in adults, under the same clinical criteria as TA477 (defect over 2cm2, no prior repair surgery). A spheroid-based ACI product.",
    "notes": "TA508. Published March 2018. Companion to TA477.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective",
      "Sports Injuries"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/ta508.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/ta508",
        "label": "Published March 2018"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "acl-injury-management",
    "section": "Knee",
    "type": "Specialist society guidance",
    "topic": "ACL injury (adult) - Best Practice",
    "subGroup": "September 2020",
    "source": "BOA (BOASt) with BASK & BOSTAA",
    "summary": "The acutely injured knee with haemarthrosis should be assessed in an acute knee clinic; not all ACL tears need reconstruction - the prime indication is symptomatic instability. Aim of treatment is to restore functional stability. Covers prehabilitation, graft selection, combined meniscal repair, and criteria-based return to sport (rarely before 9 months).",
    "notes": "September 2020. Joint BOA/BASK/BOSTAA document; fills the ACL gap left by the Cloudflare-blocked BASK site. A separate Best Practice Book provides fuller guidance.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective",
      "Sports Injuries"
    ],
    "priority": "medium",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified against fetched PDF.",
    "versions": [
      {
        "url": "https://www.boa.ac.uk/asset/1232CAB5-2B7F-4CE1-87833268B0EA5403/",
        "label": "September 2020"
      },
      {
        "url": "https://www.boa.ac.uk/standards-guidance/boasts.html",
        "label": "Fallback / index page"
      },
      {
        "url": "https://www.boa.ac.uk/asset/88A4C3E3%2DDF3E%2D4E51%2DA92E7D2F86D7D82A/",
        "label": "Accompanying Best Practice Book"
      }
    ]
  },
  {
    "id": "acl-skeletally-immature",
    "section": "Knee",
    "type": "Specialist society guidance",
    "topic": "ACL injury in the skeletally immature patient",
    "subGroup": "May 2022",
    "source": "BOA (BOASt) with BASK & BOSTAA",
    "summary": "Paediatric ACL injuries need specialist paediatric/knee referral because of physeal considerations in reconstruction timing and technique. Manage the acutely swollen knee, exclude meniscal/osteochondral injury, and avoid delay that risks further meniscal damage.",
    "notes": "May 2022. Jointly produced with BASK and BOSTAA.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Paediatrics",
      "Sports Injuries"
    ],
    "priority": "medium",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "200 response, non-colliding GUID. Content-check pending.",
    "versions": [
      {
        "url": "https://www.boa.ac.uk/asset/EA032921%2D2A7F%2D4A15%2D8F7033524E4678D5/",
        "label": "May 2022"
      },
      {
        "url": "https://www.boa.ac.uk/standards-guidance/boasts.html",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bostaa-acl-postop-protocols",
    "section": "Knee",
    "type": "Specialist society guidance",
    "topic": "ACL reconstruction post-operative protocols",
    "subGroup": "Current",
    "source": "BOSTAA",
    "summary": "BOSTAA-hosted ACL reconstruction post-operative rehabilitation protocols - weight-bearing timelines, return-to-run criteria and sport-specific clearance metrics. The practical rehab counterpart to the BOA/BASK/BOSTAA ACL Best Practice document (return to sport rarely before 9 months).",
    "notes": "Hosted under BOSTAA's Research section, not a formal guideline. The only clinically-usable BOSTAA-specific resource found.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective",
      "Sports Injuries",
      "Rehabilitation"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URL confirmed in BOSTAA official site navigation (Research section).",
    "versions": [
      {
        "url": "https://bostaa.ac.uk/ACL-R-Post-op-protocols",
        "label": "Current"
      },
      {
        "url": "https://www.bostaa.ac.uk/",
        "label": "Fallback / index page"
      },
      {
        "url": "https://www.uknlr.co.uk/",
        "label": "National Ligament Registry"
      },
      {
        "url": "https://bostaa.ac.uk/James-Lind-Alliance-First-Time-Soft-Tissue-Knee-Injuries-Priority-Setting-Partne",
        "label": "JLA soft tissue knee injuries PSP"
      }
    ]
  },
  {
    "id": "nice-aposhealth-knee-htg671",
    "section": "Knee",
    "type": "National guidance",
    "topic": "AposHealth for knee osteoarthritis",
    "subGroup": "Published April 2023",
    "source": "NICE",
    "summary": "AposHealth foot-worn biomechanical device programme for knee osteoarthritis. Recommended as a cost-saving non-surgical treatment for adults who meet criteria for total knee replacement but are unwilling or unfit for surgery.",
    "notes": "HTG671 (migrated from MTG76, replacing MIB284). Published April 2023.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Rehabilitation"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg671.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg671",
        "label": "Published April 2023"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-rf-chondroplasty-htg340",
    "section": "Knee",
    "type": "National guidance",
    "topic": "Arthroscopic radiofrequency chondroplasty for discrete chondral defects",
    "subGroup": "Published May 2014",
    "source": "NICE",
    "summary": "Using a radiofrequency probe to heat and smooth rough edges of discrete cartilage defects in the knee arthroscopically. Safe under standard governance, but fluid temperature must be strictly controlled to avoid thermal necrosis of healthy cartilage.",
    "notes": "HTG340 (migrated from IPG493). Published May 2014.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Sports Injuries"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg340.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg340",
        "label": "Published May 2014"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "ebi-arthroscopic-surgery-meniscal-tears",
    "section": "Knee",
    "type": "National guidance",
    "topic": "Arthroscopic surgery for meniscal tears",
    "source": "NHS Evidence-Based Interventions (EBI) programme / Academy of Medical Royal Colleges",
    "summary": "Best Practice Guidance: routine arthroscopy for degenerative knee disease with no specific target pathology is not recommended; follows the BASK meniscal surgery national treatment guideline and consensus statement. Uses the BRAN framework (Benefits, Risks, Alternatives, do Nothing) for shared decision-making.",
    "notes": "Published Jan 2020, last reviewed Sept 2024. Individual EBI intervention page (parent overview: nhs-ebi-programme). Cross-references bask-meniscal-surgery-guidelines row directly - the EBI page formally adopts the BASK guideline as its recommendation.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Elective"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "CONFIRMED 29/07/2026: fetched directly, exact deep link to this specific intervention page (not the generic EBI front page). Full content read - Summary/Recommendation/Rationale/Patient information/Coding/References sections all present and current as of the page's own 'last reviewed' date.",
    "versions": [
      {
        "url": "https://ebi.aomrc.org.uk/interventions/arthroscopic-surgery-for-meniscal-tears/",
        "label": "Current"
      },
      {
        "url": "https://ebi.aomrc.org.uk/specialty/musculoskeletal-spine/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-trochleoplasty-htg328",
    "section": "Knee",
    "type": "National guidance",
    "topic": "Arthroscopic trochleoplasty for patellar instability",
    "subGroup": "Published Jan 2014",
    "source": "NICE",
    "summary": "Reshaping the bony trochlea (deepening the groove or elevating the lateral wall) to treat patellar instability, typically in trochlear dysplasia. Advanced specialist procedure requiring special governance due to cartilage necrosis risk.",
    "notes": "HTG328 (migrated from IPG474). Published Jan 2014. Relevant to the BOASt recurrent patellar instability pathway.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Sports Injuries"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg328.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg328",
        "label": "Published Jan 2014"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-aci-ta477",
    "section": "Knee",
    "type": "National guidance",
    "topic": "Autologous chondrocyte implantation (ACI) for articular cartilage defects of the knee",
    "subGroup": "Published Oct 2017",
    "source": "NICE",
    "summary": "ACI for symptomatic articular cartilage defects of the knee. Recommended only if the patient has had no previous repair surgery for the defect, the defect is over 2cm2, and there is minimal osteoarthritis, managed in a specialist unit.",
    "notes": "TA477. Published Oct 2017; replaced TA89. Strict funding criteria.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective",
      "Sports Injuries"
    ],
    "priority": "medium",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/ta477.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/ta477",
        "label": "Published Oct 2017"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "first-time-lateral-patellar-dislocation",
    "section": "Knee",
    "type": "Specialist society guidance",
    "topic": "First-time lateral patellar dislocation (FTLPD)",
    "subGroup": "December 2024",
    "source": "BOA (BOASt)",
    "summary": "Reduce acute dislocation without delay; do not aspirate haemarthrosis. AP, lateral and skyline radiographs. No cast - encourage immediate weight-bearing. Review within 2 weeks; MRI if associated injury (osteochondral fracture, ACL) suspected. Surgery solely to stabilise the patella is not offered routinely after isolated first-time dislocation.",
    "notes": "December 2024. Applies to suspected dislocations in any age group.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Trauma",
      "Emergencies"
    ],
    "priority": "medium",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified against fetched PDF.",
    "versions": [
      {
        "url": "https://www.boa.ac.uk/asset/4D585229%2D6598%2D445C%2D81AB07A90CD15D65/",
        "label": "December 2024"
      },
      {
        "url": "https://www.boa.ac.uk/standards-guidance/boasts.html",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-focal-resurfacing-htg635",
    "section": "Knee",
    "type": "National guidance",
    "topic": "Focal resurfacing implants for articular cartilage damage in the knee",
    "subGroup": "Published Aug 2022",
    "source": "NICE",
    "summary": "Replacing a small area of damaged knee cartilage with a metallic or synthetic focal implant. Evidence limited - use only with special arrangements for clinical governance, consent and audit.",
    "notes": "HTG635 (migrated from IPG734). Published Aug 2022.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg635.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg635",
        "label": "Published Aug 2022"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-genicular-embolisation-htg595",
    "section": "Knee",
    "type": "National guidance",
    "topic": "Genicular artery embolisation for knee OA pain",
    "subGroup": "Published Oct 2021",
    "source": "NICE",
    "summary": "Inserting a catheter via the groin into the genicular artery and injecting particles to block abnormal new blood vessels, reducing knee OA pain. Evidence limited in quantity and quality - research use only.",
    "notes": "HTG595 (migrated from IPG708). Published Oct 2021. Experimental interventional radiology technique.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Imaging"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg595.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg595",
        "label": "Published Oct 2021"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-joint-distraction-knee-htg381",
    "section": "Knee",
    "type": "National guidance",
    "topic": "Joint distraction for knee OA (without alignment correction)",
    "subGroup": "Published July 2015",
    "source": "NICE",
    "summary": "Fixing an external frame around the knee to offload the joint and encourage cartilage repair, without correcting alignment. Research use only due to pin-site infection rates and uncertain chondroprotective effect.",
    "notes": "HTG381 (migrated from IPG529). Published July 2015.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Limb Reconstruction"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg381.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg381",
        "label": "Published July 2015"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "ebi-knee-arthroscopy-osteoarthritis",
    "section": "Knee",
    "type": "National guidance",
    "topic": "Knee arthroscopy for patients with osteoarthritis",
    "source": "NHS Evidence-Based Interventions (EBI) programme / Academy of Medical Royal Colleges",
    "summary": "Statutory EBI guidance: arthroscopic knee washout/debridement should NOT be used to treat osteoarthritis - clinically ineffective; only offer if there is a clear history of mechanical locking. Uses the BRAN framework (Benefits, Risks, Alternatives, do Nothing) for shared decision-making.",
    "notes": "Published Jan 2019, last reviewed Sept 2024. Individual EBI intervention page (parent overview: nhs-ebi-programme). Cites NICE IPG230/IP366 and the BOA/RCS commissioning guide.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Elective"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "CONFIRMED 29/07/2026: fetched directly, exact deep link to this specific intervention page (not the generic EBI front page). Full content read - Summary/Recommendation/Rationale/Patient information/Coding/References sections all present and current as of the page's own 'last reviewed' date.",
    "versions": [
      {
        "url": "https://ebi.aomrc.org.uk/interventions/knee-arthroscopy-for-patients-with-osteoarthritis/",
        "label": "Current"
      },
      {
        "url": "https://ebi.aomrc.org.uk/specialty/musculoskeletal-spine/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "ebi-knee-mri-suspected-meniscal-tears",
    "section": "Knee",
    "type": "National guidance",
    "topic": "Knee MRI for suspected meniscal tears",
    "source": "NHS Evidence-Based Interventions (EBI) programme / Academy of Medical Royal Colleges",
    "summary": "Best Practice Guidance: MRI indicated for a locked knee, a significant acute injury with mechanical symptoms, or persistent mechanical symptoms after 3 months of non-operative care; not indicated for most primary-care knee pain. Uses the BRAN framework (Benefits, Risks, Alternatives, do Nothing) for shared decision-making.",
    "notes": "Published Jan 2020, last reviewed Sept 2024. Individual EBI intervention page (parent overview: nhs-ebi-programme). Coding metric shared with ebi-knee-mri-osteoarthritis-suggestive.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Elective",
      "Quick Reference"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "CONFIRMED 29/07/2026: fetched directly, exact deep link to this specific intervention page (not the generic EBI front page). Full content read - Summary/Recommendation/Rationale/Patient information/Coding/References sections all present and current as of the page's own 'last reviewed' date.",
    "versions": [
      {
        "url": "https://ebi.aomrc.org.uk/interventions/knee-mri-for-suspected-meniscal-tears/",
        "label": "Current"
      },
      {
        "url": "https://ebi.aomrc.org.uk/specialty/musculoskeletal-spine/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "ebi-knee-mri-osteoarthritis-suggestive",
    "section": "Knee",
    "type": "National guidance",
    "topic": "Knee MRI when symptoms are suggestive of osteoarthritis",
    "source": "NHS Evidence-Based Interventions (EBI) programme / Academy of Medical Royal Colleges",
    "summary": "Best Practice Guidance: diagnose knee OA clinically where possible (NICE criteria); weight-bearing radiographs are first-line imaging; MRI reserved for severe symptoms with mild X-ray findings or pre-operative planning (osteotomy/partial knee replacement). Uses the BRAN framework (Benefits, Risks, Alternatives, do Nothing) for shared decision-making.",
    "notes": "Published Jan 2020, last reviewed Sept 2024. Individual EBI intervention page (parent overview: nhs-ebi-programme). Incorporates EULAR imaging-in-OA recommendations.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Elective",
      "Quick Reference"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "CONFIRMED 29/07/2026: fetched directly, exact deep link to this specific intervention page (not the generic EBI front page). Full content read - Summary/Recommendation/Rationale/Patient information/Coding/References sections all present and current as of the page's own 'last reviewed' date.",
    "versions": [
      {
        "url": "https://ebi.aomrc.org.uk/interventions/knee-mri-when-symptoms-are-suggestive-of-osteoarthritis/",
        "label": "Current"
      },
      {
        "url": "https://ebi.aomrc.org.uk/specialty/musculoskeletal-spine/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-mr-therapy-knee-htg588",
    "section": "Knee",
    "type": "National guidance",
    "topic": "Magnetic resonance therapy for knee osteoarthritis",
    "subGroup": "Published Aug 2021",
    "source": "NICE",
    "summary": "Placing a magnetic resonance device (MBST) over the knee to stimulate cartilage healing and relieve OA symptoms. Insufficient evidence of efficacy for routine use - research only.",
    "notes": "HTG588 (migrated from IPG702). Published Aug 2021.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Rehabilitation"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg588.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg588",
        "label": "Published Aug 2021"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bask-meniscal-surgery-guidelines",
    "section": "Knee",
    "type": "Specialist society guidance",
    "topic": "Management of meniscal injuries",
    "subGroup": "2018",
    "source": "BASK (British Association for Surgery of the Knee)",
    "summary": "National consensus on managing meniscal tears. Non-operative management is first line for degenerative tears; arthroscopy is reserved for locked knees or specific reconstructive cases.",
    "notes": "2018. NEWLY ADDED - closes the BASK provider gap (the BASK site was Cloudflare-blocked in pass 1). Note: BASK also co-authors the BOA ACL and knee PJI standards already captured under BOA.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Sports Injuries",
      "Elective"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "ERROR FOUND AND FIXED 29/07/2026: the previous Primary URL (baskonline.com/professional/guidelines/) does not correspond to any page found on the live site and behaves as a generic/broken path - genuinely the kind of link this whole audit exists to catch. The correct guideline page is /professional/meniscal-surgery-guidelines/, which hosts the actual PDF (BASK-Meniscal-Surgery-Guideline-2018.pdf, 21-surgeon Delphi process, published in the Bone & Joint Journal 2019). Primary URL now points directly at that PDF; the guideline landing page is the Fallback.",
    "versions": [
      {
        "url": "https://baskonline.com/professional/wp-content/uploads/sites/5/2018/07/BASK-Meniscal-Surgery-Guideline-2018.pdf",
        "label": "2018"
      },
      {
        "url": "https://baskonline.com/professional/meniscal-surgery-guidelines/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-mini-incision-tkr-htg220",
    "section": "Knee",
    "type": "National guidance",
    "topic": "Mini-incision surgery for total knee replacement",
    "subGroup": "Published May 2010",
    "source": "NICE",
    "summary": "Total knee replacement through a smaller incision using specially designed instruments. Safe, but restricted visibility can increase implant malalignment risk - requires standard governance and specific training.",
    "notes": "HTG220 (migrated from IPG345, replacing IPG117). Published May 2010.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg220.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg220",
        "label": "Published May 2010"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-mosaicplasty-htg463",
    "section": "Knee",
    "type": "National guidance",
    "topic": "Mosaicplasty for symptomatic articular cartilage defects of the knee",
    "subGroup": "Published March 2018",
    "source": "NICE",
    "summary": "Taking healthy cartilage plugs from the joint edge and transferring them into drilled tunnels at the damaged site (osteochondral autograft transfer / OATS) for small symptomatic defects.",
    "notes": "HTG463 (migrated from IPG607, replacing IPG162). Published March 2018.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Sports Injuries"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg463.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg463",
        "label": "Published March 2018"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-meniscal-scaffold-htg289",
    "section": "Knee",
    "type": "National guidance",
    "topic": "Partial meniscus replacement using a biodegradable scaffold",
    "subGroup": "Published July 2012",
    "source": "NICE",
    "summary": "Placing a biodegradable implant (Actifit/Menaflex) into the meniscus to support regrowth after partial meniscal loss. Long-term efficacy evidence limited - use only under special governance and audit, usually for post-meniscectomy pain.",
    "notes": "HTG289 (migrated from IPG430). Published July 2012.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Sports Injuries"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg289.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg289",
        "label": "Published July 2012"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-prp-knee-htg497",
    "section": "Knee",
    "type": "National guidance",
    "topic": "Platelet-rich plasma (PRP) injections for knee osteoarthritis",
    "subGroup": "Published Jan 2019",
    "source": "NICE",
    "summary": "Injecting platelet-rich plasma prepared from the patient's own blood into the knee to relieve OA symptoms. Safe but efficacy variable; patients must be informed of uncertain long-term benefit compared with standard therapies.",
    "notes": "HTG497 (migrated from IPG637, replacing IPG491). Published Jan 2019; review due 2026.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Sports Injuries",
      "Rehabilitation"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg497.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg497",
        "label": "Published Jan 2019"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-rf-denervation-knee-htg686",
    "section": "Knee",
    "type": "National guidance",
    "topic": "Radiofrequency denervation for osteoarthritic knee pain",
    "subGroup": "Published June 2023",
    "source": "NICE",
    "summary": "Applying radiofrequency heat to the genicular nerves to reduce osteoarthritic knee pain, for patients with severe OA pain unfit for or wishing to avoid arthroplasty, under standard clinical governance.",
    "notes": "HTG686 (migrated from IPG767). Published June 2023.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Rehabilitation",
      "Older Adult"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg686.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg686",
        "label": "Published June 2023"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-shock-absorber-knee-htg366",
    "section": "Knee",
    "type": "National guidance",
    "topic": "Shock/load absorber implant for mild-moderate medial knee OA",
    "subGroup": "Published Jan 2015",
    "source": "NICE",
    "summary": "Implanting an extra-articular shock/load absorber (e.g. KineSpring) to offload the medial compartment in mild-to-moderate symptomatic medial knee OA. Not recommended outside research.",
    "notes": "HTG366 (migrated from IPG512). Published Jan 2015. The device no longer has a current CE mark - usable only within clinical investigations with MHRA/ethics approval.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg366.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg366",
        "label": "Published Jan 2015"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-single-step-scaffold-htg728",
    "section": "Knee",
    "type": "National guidance",
    "topic": "Single-step scaffold insertion for chondral knee defects",
    "subGroup": "Published Sept 2024, updated Aug 2025",
    "source": "NICE",
    "summary": "Inserting a scaffold into a damaged area of knee cartilage to support regrowth and repair in a single operation. Requires standard governance, audit and careful patient selection (isolated defects in active patients).",
    "notes": "HTG728 (migrated from IPG793, replacing IPG560). Published Sept 2024; updated Aug 2025 (added patient-selection and surgeon-training recommendations).",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective",
      "Sports Injuries"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg728.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg728",
        "label": "Published Sept 2024, updated Aug 2025"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bssh-hand-trauma-network",
    "section": "Local Overlay",
    "type": "Specialist society guidance",
    "topic": "BSSH Hand Trauma Network & UK Hand Registry",
    "subGroup": "Current",
    "source": "BSSH",
    "summary": "The Hand Trauma Network defines service organisation for hand trauma across the UK, establishing regional hubs and spokes for severe hand injuries (replantation, major degloving). The UK Hand Registry is BSSH's national audit database - a published NHS information standard, collected monthly.",
    "notes": "Service configuration and audit infrastructure, not bedside guidance.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Hand & Wrist",
      "Trauma",
      "Service & Commissioning"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URLs from BSSH official navigation; UK Hand Registry confirmed as a published NHS information standard.",
    "versions": [
      {
        "url": "https://www.bssh.ac.uk/professionals/trauma_network/default.aspx",
        "label": "Current"
      },
      {
        "url": "https://www.bssh.ac.uk/professionals/guidelines.aspx",
        "label": "Fallback / index page"
      },
      {
        "url": "https://www.bssh.ac.uk/professionals/audit_database.aspx",
        "label": "UK Hand Registry"
      },
      {
        "url": "https://www.bssh.ac.uk/professionals/hand_surgery_in_the_uk.aspx",
        "label": "Hand Surgery in the UK (handbook)"
      }
    ]
  },
  {
    "id": "nhfd-exemplar-local-pathways",
    "section": "Local Overlay",
    "type": "Local overlay",
    "topic": "Exemplar NOF care pathways from other trusts",
    "subGroup": "Current",
    "source": "NHFD (RCP / FFFAP)",
    "summary": "A collection of real NOF pathway documents shared by hospitals for other units to copy or adapt - Chelsea and Westminster (revised NOF pathway), Sheffield (NOF care pathway), Dorchester County Hospital, Worcester (fast-track flow chart), University Hospital Wales (fast-track femoral fracture), and Hampshire Hospitals (enhanced recovery infographic). Includes fast-track ED and block-in-ED protocols.",
    "notes": "These are TEMPLATES, explicitly shared for reuse. Highly relevant to the Local Overlay section and to any PRUH pathway work - obvious prior art before drafting anything local.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Trauma",
      "Service & Commissioning"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "CONFIRMED 29/07/2026: landing page live, all 7 templates listed with thumbnails. Individual deep-link URLs extracted directly from the page HTML (added under Additional Version Links). NOTE: automated fetch of these exact Lotus Notes deep links returned 'Error - Not found!' on this system even though they render correctly as clickable thumbnails on the live page - this looks like a session/referrer quirk of the NHFD platform rather than dead documents. Recommend a manual browser click-through on each before publishing.",
    "versions": [
      {
        "url": "https://nhfd.co.uk/FFFAP/Resources.nsf/pages/NHFD+Guidelines+and+pathways",
        "label": "Current"
      },
      {
        "url": "https://www.fffap.org.uk/",
        "label": "Fallback / index page"
      },
      {
        "url": "https://www.nhfd.co.uk/FFFAP/Resources.nsf/doc?open&BOAST,+The+care+of+the+older+or+frail+trauma+patient-min.pdf",
        "label": "BOAST - The care of the older or frail trauma patient"
      },
      {
        "url": "https://www.nhfd.co.uk/FFFAP/Resources.nsf/doc?open&Chelsea+and+Westminster,+Pathway-min.pdf",
        "label": "Chelsea and Westminster (Revised NOF Pathway)"
      },
      {
        "url": "https://www.nhfd.co.uk/FFFAP/Resources.nsf/doc?open&Dorchester+County+Hospital,+Pathway.pdf",
        "label": "Dorchester County Hospital Pathway"
      },
      {
        "url": "https://www.nhfd.co.uk/FFFAP/Resources.nsf/doc?open&Fast_track_femoral_fracture_UHW.docx",
        "label": "Fast Track Femoral Fracture (UHW)"
      },
      {
        "url": "https://www.nhfd.co.uk/FFFAP/Resources.nsf/doc?open&Hampshire+Hospitals,+Enhanced+recovery+infographic-min.pdf",
        "label": "Hampshire Hospitals enhanced recovery infographic"
      },
      {
        "url": "https://www.nhfd.co.uk/FFFAP/Resources.nsf/doc?open&Sheffield,+Pathway.pdf",
        "label": "Sheffield Pathway (NOF care pathway)"
      },
      {
        "url": "https://www.nhfd.co.uk/FFFAP/Resources.nsf/doc?open&Worcester,+Fast-track+flow-chart.pdf",
        "label": "Worcester Fast-track flow-chart"
      }
    ]
  },
  {
    "id": "nhfd-dataset-v16",
    "section": "Local Overlay",
    "type": "National guidance",
    "topic": "NHFD dataset v16 (2026) - including pelvic fractures",
    "subGroup": "v16, January 2026",
    "source": "NHFD (RCP / FFFAP)",
    "summary": "The current NHFD dataset, effective January 2026. MAJOR SCOPE CHANGE: v16 expands the audit to include PELVIC FRACTURES, piloting from January 2026 - a direct response to the finding that pelvic fracture patients do not receive the quality of care usual after hip fracture. Previous versions: v15a (from April 2024, when pre-op AMTS was withdrawn and replaced by 4AT), v15 (from Jan 2024).",
    "notes": "v16 main and theatre datasets published, plus a separate Northern Ireland version and a 2026 pelvic fractures FAQ. Critical for clinical coders and trauma coordinators. This pelvic expansion is NOT reflected in the existing project NHFD document - worth updating.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Trauma",
      "Service & Commissioning"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "v16 dataset updates and pelvic fracture expansion confirmed on the NHFD homepage news items.",
    "versions": [
      {
        "url": "https://nhfd.co.uk/FFFAP/Resources.nsf/pages/NHFD+Datasets",
        "label": "v16, January 2026"
      },
      {
        "url": "https://www.fffap.org.uk/",
        "label": "Fallback / index page"
      },
      {
        "url": "https://nhfd.co.uk/FFFAP/Resources.nsf/pages/NHFD+User+guides",
        "label": "User guides"
      },
      {
        "url": "https://www.crownaudit.org/FFFAP/nhfd.nsf",
        "label": "Crown Audit data entry portal (login)"
      }
    ]
  },
  {
    "id": "nhfd-improvement-repository",
    "section": "Local Overlay",
    "type": "National guidance",
    "topic": "NHFD Improvement Repository",
    "subGroup": "Current",
    "source": "RCP (FFFAP)",
    "summary": "Library of QI case studies from hospitals, grouped by KPI, with improvement stories and a template for sharing new ones. Includes a recommended Statistical Process Control (SPC) tool for measuring the effect of changes. Practical for trusts struggling to meet the 36-hour surgical KPI or orthogeriatric review metrics.",
    "notes": "Hosted by the RCP. Directly useful for the NOF governance project.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Trauma",
      "Service & Commissioning"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "AUDIT 29/07/2026: 'Repository' in the Topic name is itself the tell - very likely a multi-document index (same pattern as nhfd-exemplar-local-pathways, already fixed with 7 individual deep links). NOT independently fetched this pass.",
    "versions": [
      {
        "url": "https://www.rcp.ac.uk/improving-care/resources/nhfd-improvement-repository/",
        "label": "Current"
      },
      {
        "url": "https://www.fffap.org.uk/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-pffd-reconstruction-htg189",
    "section": "Paediatrics",
    "type": "National guidance",
    "topic": "Bony & soft tissue reconstruction for hip stabilisation in PFFD",
    "subGroup": "Published April 2009",
    "source": "NICE",
    "summary": "Accessing the hip and pelvis to correct deformity and stabilise the joint in proximal focal femoral deficiency, a rare congenital limb deficiency. Complex multi-stage reconstruction restricted to highly specialised paediatric limb reconstruction centres.",
    "notes": "HTG189 (migrated from IPG297). Published April 2009. Ultra-rare pathway.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Hip",
      "Limb Reconstruction"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg189.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg189",
        "label": "Published April 2009"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bscos-patient-information",
    "section": "Paediatrics",
    "type": "Specialist society guidance",
    "topic": "BSCOS patient information leaflets",
    "subGroup": "Current",
    "source": "BSCOS",
    "summary": "Patient and parent information leaflets across paediatric orthopaedic conditions including DDH, clubfoot management and paediatric fracture care. Useful for counselling families in clinic and on the ward.",
    "notes": "Public, no login.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URL confirmed on BSCOS public site navigation.",
    "versions": [
      {
        "url": "https://www.bscos.org.uk/public/guidelines-consensus-projects/patient-information-leaflets",
        "label": "Current"
      },
      {
        "url": "https://www.bscos.org.uk/public/guidelines-consensus-projects",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bscos-practice-guidelines-members",
    "section": "Paediatrics",
    "type": "Specialist society guidance",
    "topic": "BSCOS Practice Guidelines (members only)",
    "subGroup": "Current",
    "source": "BSCOS",
    "summary": "BSCOS maintains a members-only 'Practice Guidelines' area alongside 'Reviews & Reports', holding clinical guidelines and committee reports for members managing advanced children's orthopaedic conditions. Content is not publicly accessible.",
    "notes": "LOGIN REQUIRED - confirms the original catalogue's BSCOS flag. The PUBLIC consensus projects are freely accessible; only this members' area is walled. Worth asking whether the department has a BSCOS member who could confirm the contents.",
    "status": "To source",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Service & Commissioning"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "RE-CONFIRMED 29/07/2026: URL live, login wall confirmed present. Contents behind the wall remain unknown to automated tools - this cannot be resolved without a BSCOS member login.",
    "versions": [
      {
        "url": "https://www.bscos.org.uk/members/practice-guidelines",
        "label": "Current"
      },
      {
        "url": "https://www.bscos.org.uk/public/guidelines-consensus-projects",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bscos-paediatric-boasts",
    "section": "Paediatrics",
    "type": "Specialist society guidance",
    "topic": "BSCOS-endorsed paediatric BOASts (curated index)",
    "subGroup": "Current",
    "source": "BSCOS / BOA",
    "summary": "BSCOS maintains a curated index of the five BOA BOASts most relevant to paediatric orthopaedics: paediatric forearm fractures, paediatric musculoskeletal infection, paediatric ACL injury, supracondylar humeral fracture and first-time patellar dislocation.",
    "notes": "All five are already captured under BOA - this is a cross-reference/curation view for the Paediatrics section, not new content. Do not double-count.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Trauma"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "RE-CONFIRMED 29/07/2026: URL live. Existing Notes already correctly flag this as a curated cross-reference to BOASts captured elsewhere under BOA rows - not a hub-vs-guideline problem, by design. No expansion needed (would duplicate existing BOA rows).",
    "versions": [
      {
        "url": "https://www.bscos.org.uk/public/guidelines-consensus-projects/boasts",
        "label": "Current"
      },
      {
        "url": "https://www.bscos.org.uk/public/guidelines-consensus-projects",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "paediatric-msk-infection",
    "section": "Paediatrics",
    "type": "Specialist society guidance",
    "topic": "Children with acute musculoskeletal infection",
    "subGroup": "May 2022",
    "source": "BOA (BOASt)",
    "summary": "Covers septic arthritis, osteomyelitis, discitis and pyomyositis in children. In the acutely limping/febrile child differentiate septic arthritis (Kocher criteria) from transient synovitis and osteomyelitis; urgent bloods, imaging and joint aspiration where indicated. Cellulitis may indicate infection of deeper structures. Low threshold for senior/ortho referral.",
    "notes": "May 2022. BSCOS endorsed and FORMULATED FROM the BSCOS Delphi consensus (BJJ 2023) - link both.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Infection & Tumour",
      "Emergencies"
    ],
    "priority": "high",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "200 response, non-colliding GUID; second pass confirmed May 2022. Content-check pending.",
    "versions": [
      {
        "url": "https://www.boa.ac.uk/asset/265761C4%2D3414%2D4377%2D89F3354EAEC7C6FE/",
        "label": "May 2022"
      },
      {
        "url": "https://www.boa.ac.uk/standards-guidance/boasts.html",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bscos-ddh-consensus",
    "section": "Paediatrics",
    "type": "Specialist society guidance",
    "topic": "Developmental dysplasia of the hip (DDH) in children under 3 months - BSCOS consensus",
    "subGroup": "2023",
    "source": "BSCOS",
    "summary": "National Delphi consensus on DDH management in the first three months of life: screening and surveillance (15 questions), ultrasound technique (8), initiation of treatment (19), care during splint treatment (10), and quality/governance. Supports continuing clinical examination at birth plus a 6-8 week community examination by a small group of expert examiners in the maternity setting. KEY RECOMMENDATION: EXPAND current selective-screening risk factors (breech, multiple birth, family history) to also include non-CTEV foot deformities and packaging disorders. Ultrasound at 6 weeks for infants with risk factors or clinical instability; Pavlik harness.",
    "notes": "Published Bone & Joint Journal 2023;105-B(2). Aarvold, Perry, Mavrotas, Theologis, Katchburian on behalf of the BSCOS DDH Consensus Group. Full PDF FREELY available on the BSCOS site - no login. CLOSES THE DDH GAP.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Hip",
      "Imaging"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Public PDF confirmed on bscos.org.uk (no login wall); BJJ citation verified.",
    "versions": [
      {
        "url": "https://www.bscos.org.uk/Portals/0/assets/Consensus/DDH0301-620X.105B2.BJJ-2022-0893.R1.pdf",
        "label": "2023"
      },
      {
        "url": "https://www.bscos.org.uk/public/guidelines-consensus-projects",
        "label": "Fallback / index page"
      },
      {
        "url": "https://www.bscos.org.uk/public/guidelines-consensus-projects/consensus-project/ddh-consensus-steering-group",
        "label": "Consensus project page"
      },
      {
        "url": "https://boneandjoint.org.uk/Article/10.1302/0301-620X.105B2.BJJ-2022-0893.R1",
        "label": "BJJ article"
      }
    ]
  },
  {
    "id": "paediatric-forearm-fracture",
    "section": "Paediatrics",
    "type": "Specialist society guidance",
    "topic": "Early management of the paediatric forearm fracture",
    "subGroup": "May 2021",
    "source": "BOA (BOASt)",
    "summary": "Assess neurovascular status, provide analgesia and appropriate immobilisation. Supports early closed reduction by manipulation, avoiding admission and GA for the majority of forearm fractures that exceed remodelling potential; displaced/unstable patterns need theatre. Note remodelling potential vs acceptable angulation thresholds by age.",
    "notes": "May 2021.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Trauma"
    ],
    "priority": "medium",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "200 response, non-colliding GUID. Content-check pending.",
    "versions": [
      {
        "url": "https://www.boa.ac.uk/asset/57EA20EC%2D8EDB%2D46CE%2D879222A813CE9AF6/",
        "label": "May 2021"
      },
      {
        "url": "https://www.boa.ac.uk/standards-guidance/boasts.html",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bscos-flexible-flatfoot-consensus",
    "section": "Paediatrics",
    "type": "Specialist society guidance",
    "topic": "Flexible flatfoot in children - BSCOS consensus",
    "subGroup": "2023 (disputed)",
    "source": "BSCOS",
    "summary": "Consensus on paediatric flexible flatfoot - a very common referral. Painless flexible flatfoot is a normal variant in children requiring reassurance rather than active treatment, insoles or surgery.",
    "notes": "CONFLICT BETWEEN PASSES on publication status: pass 1 could not confirm publication; pass 2 reported confirmed (2023). VERIFY.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Foot & Ankle"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "CONFLICT RESOLVED 29/07/2026: page is live and publishes the full 26-statement consensus (Assessment / Conservative Treatment / Surgical Treatment). Publication is confirmed - pass 2 was correct, pass 1's 'could not confirm' finding is superseded.",
    "versions": [
      {
        "url": "https://www.bscos.org.uk/public/guidelines-consensus-projects/consensus-projects/flexible-flatfoot",
        "label": "2023 (disputed)"
      },
      {
        "url": "https://www.bscos.org.uk/public/guidelines-consensus-projects",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bscos-itw-consensus",
    "section": "Paediatrics",
    "type": "Specialist society guidance",
    "topic": "Idiopathic toe walking (ITW) - BSCOS consensus",
    "subGroup": "2021",
    "source": "BSCOS",
    "summary": "Consensus on idiopathic toe walking in children - assessment, differentiation from neurological causes (cerebral palsy, muscular dystrophy, mild CP) before diagnosing ITW, and management favouring conservative measures (stretching, observation) over early surgical lengthening. Consensus statement intended for sharing with carers and patient groups.",
    "notes": "Publication of a consensus statement CONFIRMED.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Foot & Ankle"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Consensus project page confirmed on the BSCOS public site; publication confirmed.",
    "versions": [
      {
        "url": "https://www.bscos.org.uk/public/guidelines-consensus-projects/consensus-project/itw",
        "label": "2021"
      },
      {
        "url": "https://www.bscos.org.uk/public/guidelines-consensus-projects",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-scfe-open-reduction-htg365",
    "section": "Paediatrics",
    "type": "National guidance",
    "topic": "Open reduction of slipped capital femoral epiphysis (SCFE)",
    "subGroup": "Published Jan 2015",
    "source": "NICE",
    "summary": "Fixing a slipped capital femoral epiphysis back into position (e.g. modified Dunn procedure) to reduce avascular necrosis risk. Safe but carries significant AVN risk - must be performed only by specialist paediatric orthopaedic surgeons in tertiary centres.",
    "notes": "HTG365 (migrated from IPG511). Published Jan 2015. Note: no UK consensus guideline exists for acute SCFE presentation - see Gaps register.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Hip"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg365.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg365",
        "label": "Published Jan 2015"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bscos-msk-infection-consensus",
    "section": "Paediatrics",
    "type": "Specialist society guidance",
    "topic": "Paediatric musculoskeletal infection - BSCOS consensus guidelines",
    "subGroup": "July 2023",
    "source": "BSCOS (Paediatric MSK Infection Consensus Group)",
    "summary": "Delphi consensus on investigation and management of MSK infection in children aged 0-15 - septic arthritis, osteomyelitis, pyomyositis, tenosynovitis, fasciitis and discitis. Three domains: (1) assessment, investigation and diagnosis; (2) treatment; (3) service, pathways and networks. Statements required 75%+ agreement. Specifies FBC, CRP and ESR in every case. Recommends each region agrees pathways where specialist and supra-regional centres support DGHs. Avoid empirical antibiotics before culture samples are taken.",
    "notes": "Published Bone & Joint Journal 2023;105-B(7); Delphi statements approved July 2021. THE BOA BOASt 'Management of Children with Acute MSK Infection' (2022) WAS FORMULATED FROM THIS CONSENSUS - this is the parent source document. MERGED RECORD (deduped from two entries).",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Infection & Tumour",
      "Emergencies"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Publication confirmed (BJJ 2023, PubMed 37399098); BSCOS steering group page confirmed live.",
    "versions": [
      {
        "url": "https://boneandjoint.org.uk/Article/10.1302/0301-620X.105B7.BJJ-2022-1316.R1",
        "label": "July 2023"
      },
      {
        "url": "https://www.bscos.org.uk/public/guidelines-consensus-projects/consensus-project/musculoskeletal-infection-steering-group",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "girft-paediatric-trauma-orthopaedics-report",
    "section": "Paediatrics",
    "type": "National guidance",
    "topic": "Paediatric trauma & orthopaedic surgery - GIRFT national specialty report",
    "subGroup": "April 2022",
    "source": "GIRFT (NHS England)",
    "summary": "National specialty report by James Hunter, from data on 128 trusts and virtual visits to 127. Covers under-16s treated by T&O surgeons (excluding spinal surgery) - DDH, club foot, neuromuscular conditions and childhood fractures. 32 recommendations including dual-surgeon operating in complex cases, treating common simple upper limb fractures in ED rather than trauma lists or fracture clinics, and aligning paediatric orthopaedic networks with Surgery in Children Operational Delivery Networks. Over 8,600 under-16s seen weekly in English fracture clinics.",
    "notes": "April 2022. Service-configuration report, not bedside guidance.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Trauma",
      "Service & Commissioning"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Specialty page verified in pass 1; direct PDF URL confirmed in pass 2.",
    "versions": [
      {
        "url": "https://gettingitrightfirsttime.co.uk/wp-content/uploads/2022/09/Paed-TO-4-4-22i.pdf",
        "label": "April 2022"
      },
      {
        "url": "https://gettingitrightfirsttime.co.uk/surgical_specialties/paediatrictrauma-and-orthopaedic-surgery/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "paediatric-supracondylar-fracture",
    "section": "Paediatrics",
    "type": "Specialist society guidance",
    "topic": "Supracondylar fractures of the humerus in children",
    "subGroup": "Updated October 2020",
    "source": "BOA (BOASt)",
    "summary": "The commonest fracture about the elbow in children. Assess and document neurovascular status (especially anterior interosseous nerve, radial pulse) - a pink pulseless hand vs a white pulseless hand changes urgency. Gartland classification guides management; displaced fractures need urgent reduction/K-wiring.",
    "notes": "Updated October 2020.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Trauma",
      "Emergencies"
    ],
    "priority": "high",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "200 response, non-colliding GUID. Content-check pending.",
    "versions": [
      {
        "url": "https://www.boa.ac.uk/asset/A240155A%2DF0DD%2D4BE7%2D8C8AF7B6CC4DA795/",
        "label": "Updated October 2020"
      },
      {
        "url": "https://www.boa.ac.uk/standards-guidance/boasts.html",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bscos-weightbearing-consensus",
    "section": "Paediatrics",
    "type": "Specialist society guidance",
    "topic": "Weight-bearing in children - BSCOS consensus",
    "subGroup": "2023 (disputed)",
    "source": "BSCOS",
    "summary": "Consensus on weight-bearing in paediatric orthopaedics. Children should generally be allowed to weight-bear as pain allows after most lower limb fractures, as strict non-weight-bearing is functionally impossible to enforce and rarely clinically necessary. Complements the adult-focused BOASt on mobilisation and weight-bearing.",
    "notes": "CONFLICT BETWEEN PASSES on publication status: pass 1 could not confirm a published statement (possible work in progress); pass 2 reported publication confirmed (2023). VERIFY before presenting as guidance.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Trauma",
      "Rehabilitation"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "CONFLICT RESOLVED 29/07/2026: landing page live and publication confirmed ('Defining accurate terminology for post-injury weightbearing instructions', BJJ 106-B, 2024). Primary URL upgraded from the landing page to the direct BJJ paper PDF deep link per the sheet's own URL strategy (deep link straight to the document); landing page moved to Fallback.",
    "versions": [
      {
        "url": "https://www.bscos.org.uk/Portals/0/assets/Consensus/W.B0301-620X.106B.BJJ-2024-0371.R1.pdf",
        "label": "2023 (disputed)"
      },
      {
        "url": "https://www.bscos.org.uk/public/guidelines-consensus-projects/consensus-project/weightbearing",
        "label": "Fallback / index page"
      },
      {
        "url": "https://www.bscos.org.uk/Portals/0/assets/Consensus/BJJ-2024-0371.R1_supplementary_material.pdf",
        "label": "Supplementary material (BJJ)"
      },
      {
        "url": "https://www.bscos.org.uk/Portals/0/assets/Consensus/Mobilisation-and-weightbearing-after-orthopaedic-surgery-musculoskeletal-injury-BOAST.pdf",
        "label": "BOAST guideline (Aug 2024)"
      }
    ]
  },
  {
    "id": "bssh-hand-trauma-app",
    "section": "Quick Reference",
    "type": "Quick reference",
    "topic": "BSSH Hand Trauma Triage App",
    "subGroup": "Current",
    "source": "BSSH",
    "summary": "A hand injury triage app produced by BSSH to help clinicians apply the Standards of Care in Hand Trauma at the point of referral - supporting correct timing and routing of hand injuries, assessing severity and securely transmitting photos to on-call hand surgeons. Cited in national audits as the tool for improving guideline adherence.",
    "notes": "PRIOR ART for this project - BSSH's own answer to the same 'get the guideline to the SHO at the point of decision' problem. Worth reviewing before the demo.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Hand & Wrist",
      "Emergencies"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-23",
    "linkVerificationNotes": "URL from BSSH official Guidelines & Resources navigation. | 2026-08-23 remediation: dead fallback (bssh.ac.uk/professionals/hand_trauma_app.aspx, HTTP 404 — BSSH moved the page up one level). The primary already pointed at the correct live URL, so the fallback was repointed at the BSSH Guidelines & Resources index (HTTP 200) rather than duplicating the primary.",
    "versions": [
      {
        "url": "https://www.bssh.ac.uk/hand_trauma_app.aspx",
        "label": "Current"
      },
      {
        "url": "https://www.bssh.ac.uk/professionals/guidelines.aspx",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bess-shoulder-diagnosis-poster",
    "section": "Quick Reference",
    "type": "Quick reference",
    "topic": "Diagnosis of shoulder pain in primary care (poster)",
    "subGroup": "2014, updated 2021",
    "source": "BESS / BOA",
    "summary": "One-page diagnostic algorithm poster - distinguishes neck vs shoulder, then routes through instability, AC joint disease, glenohumeral (frozen shoulder/arthritis) and rotator cuff tendinopathy, with explicit RED FLAGS for urgent referral: (1) trauma, pain and weakness - acute cuff tear; (2) mass or swelling - tumour; (3) red skin, fever, systemically unwell - infection; (4) trauma/seizure/electric shock with loss of rotation and abnormal shape - unreduced dislocation.",
    "notes": "2014, updated 2021. Excellent Quick Reference candidate - a genuine one-glance on-call algorithm.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Shoulder & Elbow",
      "Emergencies"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URL from the BESS official page; algorithm content confirmed within the Traumatic Anterior Instability PDF (Figure 2).",
    "versions": [
      {
        "url": "https://bess.ac.uk/download/1421/primary-intermediate-care-guidelines/6624/diagnosis-of-shoulder-pain-in-primary-care-poster.pdf",
        "label": "2014, updated 2021"
      },
      {
        "url": "https://bess.ac.uk/patient-care-pathways-and-guidelines/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bofas-radiology",
    "section": "Quick Reference",
    "type": "Quick reference",
    "topic": "Foot & ankle radiology - BOFAS Hyperbook",
    "subGroup": "Current",
    "source": "BOFAS (Hyperbook)",
    "summary": "A nine-part structured radiology reference: radiographic views, alignment, anatomical variation, bone pathology, fractures, bone tumours, post-operative radiographs, joint and soft tissue pathology, and advanced imaging. Practical for interpreting foot & ankle films on call.",
    "notes": "BOFAS Hyperbook, Radiology section. Strong Quick Reference candidate.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Foot & Ankle",
      "Trauma",
      "Imaging"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URLs from BOFAS Hyperbook official navigation.",
    "versions": [
      {
        "url": "https://www.bofas.org.uk/hyperbook/radiology",
        "label": "Current"
      },
      {
        "url": "https://www.bofas.org.uk/hyperbook/home",
        "label": "Fallback / index page"
      },
      {
        "url": "https://www.bofas.org.uk",
        "label": "Bone tumours: /hyperbook/radiology/6-bone-tumours (prefix"
      }
    ]
  },
  {
    "id": "frax-calculator",
    "section": "Quick Reference",
    "type": "Quick reference",
    "topic": "FRAX fracture risk calculator",
    "subGroup": "Current",
    "source": "NOGG / FRAXplus / University of Sheffield",
    "summary": "The FRAX tool calculates 10-year probability of major osteoporotic fracture and hip fracture, and is the basis of NOGG's intervention thresholds. Drives primary care prescribing and FLS interventions. NOGG also provides manual data entry for interpreting FRAX output against UK thresholds.",
    "notes": "STRONG QUICK REFERENCE CANDIDATE - a working calculator usable at the bedside, not just a document. Two URLs exist: FRAXplus (new) and the Sheffield FRAX UK tool.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Bone Health",
      "Older Adult"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URLs confirmed in NOGG official site navigation (pass 1) and Sheffield FRAX UK tool confirmed (pass 2).",
    "versions": [
      {
        "url": "https://frax.shef.ac.uk/FRAX/tool.aspx?country=1",
        "label": "Current"
      },
      {
        "url": "https://fraxplus.org/calculation-tool",
        "label": "Fallback / index page"
      },
      {
        "url": "https://www.nogg.org.uk/manual-data-entry",
        "label": "NOGG manual data entry"
      }
    ]
  },
  {
    "id": "nice-gaitsmart-htg716",
    "section": "Rehabilitation",
    "type": "National guidance",
    "topic": "GaitSmart rehabilitation exercise programme for gait/mobility issues",
    "subGroup": "Published April 2024",
    "source": "NICE",
    "summary": "The GaitSmart sensor-based assessment and vGym personalised exercise rehabilitation programme for adults with gait and mobility issues, particularly post-arthroplasty or for OA.",
    "notes": "HTG716 (migrated from MTG78, replacing MIB283). Published April 2024.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective",
      "Older Adult"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg716.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg716",
        "label": "Published April 2024"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "ebi-arthroscopic-shoulder-decompression-subacromial",
    "section": "Shoulder & Elbow",
    "type": "National guidance",
    "topic": "Arthroscopic shoulder decompression for subacromial pain",
    "source": "NHS Evidence-Based Interventions (EBI) programme / Academy of Medical Royal Colleges",
    "summary": "Statutory EBI guidance: subacromial decompression for pure impingement (no rotator cuff tear/ACJ pain/calcific tendinopathy) only after adequate non-operative treatment has failed, following shared decision-making - references the CSAW placebo-controlled trial. Uses the BRAN framework (Benefits, Risks, Alternatives, do Nothing) for shared decision-making.",
    "notes": "Published Jan 2019, last reviewed Sept 2024. Individual EBI intervention page (parent overview: nhs-ebi-programme).",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Elective"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "CONFIRMED 29/07/2026: fetched directly, exact deep link to this specific intervention page (not the generic EBI front page). Full content read - Summary/Recommendation/Rationale/Patient information/Coding/References sections all present and current as of the page's own 'last reviewed' date.",
    "versions": [
      {
        "url": "https://ebi.aomrc.org.uk/interventions/arthroscopic-shoulder-decompression-for-subacromial-pain/",
        "label": "Current"
      },
      {
        "url": "https://ebi.aomrc.org.uk/specialty/musculoskeletal-spine/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bess-atraumatic-shoulder-instability",
    "section": "Shoulder & Elbow",
    "type": "Specialist society guidance",
    "topic": "Atraumatic shoulder instability",
    "subGroup": "2015",
    "source": "BESS / BOA",
    "summary": "Patient care pathway for atraumatic (non-traumatic) shoulder instability - Stanmore Types 2 and 3, including multidirectional instability and muscle patterning. Specialised prolonged physiotherapy aimed at scapular control is the mainstay; surgery has a limited role and outcomes are poorer than in traumatic instability.",
    "notes": "BESS/BOA Patient Care Pathway, 2015. Companion to the traumatic instability pathway. Key to preventing inappropriate surgical referrals.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective",
      "Rehabilitation"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URL confirmed on the BESS official pathways index page.",
    "versions": [
      {
        "url": "https://bess.ac.uk/wp-content/uploads/2020/06/Atraumatic-Shoulder-Instability.pdf",
        "label": "2015"
      },
      {
        "url": "https://bess.ac.uk/patient-care-pathways-and-guidelines/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "girft-elective-total-elbow-replacement",
    "section": "Shoulder & Elbow",
    "type": "National guidance",
    "topic": "Elective total elbow replacement pathway",
    "subGroup": "January 2022",
    "source": "GIRFT (NHS England) - Orthopaedic Elective",
    "summary": "Elective total elbow replacement - patient selection, conservative management first, surgical indications and rehabilitation.",
    "notes": "January 2022. Complements the BESS elbow replacement surgical procedure guidelines.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URL from the GIRFT official pathways index.",
    "versions": [
      {
        "url": "https://gettingitrightfirsttime.co.uk/wp-content/uploads/2022/01/Orthopaedic-Elective_2022-01-24_Pathway_Elective-total-elbow-replacement.pdf",
        "label": "January 2022"
      },
      {
        "url": "https://gettingitrightfirsttime.co.uk/surgical_specialties/orthopaedic-surgery/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bess-subacromial-exercises",
    "section": "Shoulder & Elbow",
    "type": "Specialist society guidance",
    "topic": "Exercises to treat subacromial shoulder pain - guide for GPs and patients",
    "subGroup": "2018, updated 2021",
    "source": "BESS",
    "summary": "Exercise programme guide for subacromial shoulder pain aimed at GPs and patients. Encourages exercises 3-4 days a week despite mild pain, building load gradually to rehabilitate rotator cuff tendinopathy. Practical adjunct to the subacromial pain pathway.",
    "notes": "2018, updated 2021.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Rehabilitation"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URL from the BESS official Primary & Intermediate Care Guidelines page.",
    "versions": [
      {
        "url": "https://bess.ac.uk/download/1421/primary-intermediate-care-guidelines/6857/exercises-to-treat-subacromial-shoulder-pain-a-guide-for-gps-and-patients.pdf",
        "label": "2018, updated 2021"
      },
      {
        "url": "https://bess.ac.uk/patient-care-pathways-and-guidelines/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bess-frozen-shoulder",
    "section": "Shoulder & Elbow",
    "type": "Specialist society guidance",
    "topic": "Frozen shoulder (adhesive capsulitis)",
    "subGroup": "2015 (GRADE update exists)",
    "source": "BESS / BOA",
    "summary": "Diagnosis, staging (freezing/frozen/thawing) and management. Early intra-articular steroid injection plus physiotherapy; hydrodilatation, manipulation under anaesthesia and arthroscopic capsular release reserved for the mature frozen phase if symptoms fail to resolve after 6-12 months.",
    "notes": "Original 2015 pathway. NOTE: a GRADE-methodology update (literature search to March 2023) was published in Shoulder & Elbow - CHECK whether the BESS-hosted PDF is the 2015 or updated version.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Elective",
      "Rehabilitation"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "CONFIRMED 29/07/2026: PDF at this URL is the original 2015 BESS/BOA pathway (page still live in current BESS site navigation). A GRADE-methodology update (Gwilym S & Rupani N, 'BESS patient care pathway: frozen shoulder', Shoulder & Elbow, 2025) exists but is under publisher embargo on Oxford's ORA repository — not yet available as a free BESS-hosted PDF. Serve the 2015 PDF as current; re-check periodically for BESS to publish the GRADE update.",
    "versions": [
      {
        "url": "https://bess.ac.uk/wp-content/uploads/2020/06/Frozen_Shoulder.pdf",
        "label": "2015 (GRADE update exists)"
      },
      {
        "url": "https://bess.ac.uk/patient-care-pathways-and-guidelines/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bess-glenohumeral-osteoarthritis",
    "section": "Shoulder & Elbow",
    "type": "Specialist society guidance",
    "topic": "Glenohumeral osteoarthritis",
    "subGroup": "2015",
    "source": "BESS / BOA",
    "summary": "Diagnosis, conservative management (analgesia, activity modification, injections) and indications for shoulder arthroplasty, discussing anatomic total shoulder replacement versus reverse geometry based on rotator cuff integrity.",
    "notes": "2015. Read alongside NICE NG157/QS206.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective",
      "Older Adult"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URL confirmed on the BESS official pathways index page.",
    "versions": [
      {
        "url": "https://bess.ac.uk/wp-content/uploads/2020/06/Glenohumeral-osteoarthritis.pdf",
        "label": "2015"
      },
      {
        "url": "https://bess.ac.uk/patient-care-pathways-and-guidelines/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bess-elbow-replacement-spg",
    "section": "Shoulder & Elbow",
    "type": "Specialist society guidance",
    "topic": "Primary and revision elbow replacement surgery - surgical procedure guidelines",
    "subGroup": "May 2018",
    "source": "BESS / BOA",
    "summary": "Provision of primary and revision total elbow replacement in the NHS - minimum infrastructure, surgeon volume, MDT requirements and case selection. Mandates centralisation due to low national volume and high complication rates.",
    "notes": "May 2018, written in conjunction with the BOA. Complements the GIRFT elective and trauma TER pathways.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective",
      "Local Overlay"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URL confirmed on the BESS official pathways index page.",
    "versions": [
      {
        "url": "https://bess.ac.uk/wp-content/uploads/2020/06/BESS-TER-SPG-21.5.18.pdf",
        "label": "May 2018"
      },
      {
        "url": "https://bess.ac.uk/patient-care-pathways-and-guidelines/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "ebi-scans-shoulder-pain-guided-injections",
    "section": "Shoulder & Elbow",
    "type": "National guidance",
    "topic": "Scans for shoulder pain and guided injections for shoulder pain",
    "source": "NHS Evidence-Based Interventions (EBI) programme / Academy of Medical Royal Colleges",
    "summary": "Best Practice Guidance: plain X-ray is first-line for shoulder pain; USS/MRI/CT restricted to secondary care shoulder services. Image-guided subacromial injections are NOT recommended - no added benefit over unguided injections. Uses the BRAN framework (Benefits, Risks, Alternatives, do Nothing) for shared decision-making.",
    "notes": "Published Jan 2020, last reviewed Sept 2024. Individual EBI intervention page (parent overview: nhs-ebi-programme). References the BESS/BOA shoulder pain referral guidelines directly (see bess-frozen-shoulder row for the related BESS pathway).",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Elective",
      "Quick Reference"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "CONFIRMED 29/07/2026: fetched directly, exact deep link to this specific intervention page (not the generic EBI front page). Full content read - Summary/Recommendation/Rationale/Patient information/Coding/References sections all present and current as of the page's own 'last reviewed' date.",
    "versions": [
      {
        "url": "https://ebi.aomrc.org.uk/interventions/scans-for-shoulder-pain-and-guided-injections-for-shoulder-pain/",
        "label": "Current"
      },
      {
        "url": "https://ebi.aomrc.org.uk/specialty/musculoskeletal-spine/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bess-shoulder-pain-primary-intermediate-care",
    "section": "Shoulder & Elbow",
    "type": "Specialist society guidance",
    "topic": "Shoulder pain - diagnosis, treatment and referral (primary/community/intermediate care)",
    "subGroup": "Nov 2020, updated March 2021",
    "source": "BESS / BOA / NHS EBI Programme",
    "summary": "A summary document distilling the whole BESS/BOA Patient Care Pathway series into one referral-focused guideline, produced to support the NHS Evidence-Based Interventions Programme. Covers diagnosis, treatment and referral thresholds across the common shoulder conditions - explicitly outlining what community physiotherapists and GPs can manage independently, and what mandates secondary care referral (e.g. massive acute rotator cuff tear in a working-age patient). The single most practical BESS document for a non-specialist and by far the most downloaded (~19,000 hits).",
    "notes": "Created Nov 2020, updated March 2021. The consolidated 'one document to rule them all' for shoulder pain.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective",
      "Service & Commissioning"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URL from the BESS official Primary & Intermediate Care Guidelines page; file size and dates confirmed.",
    "versions": [
      {
        "url": "https://bess.ac.uk/download/1421/primary-intermediate-care-guidelines/6238/shoulder-pain-primary-community-and-intermediate-care-guidelines.pdf",
        "label": "Nov 2020, updated March 2021"
      },
      {
        "url": "https://bess.ac.uk/patient-care-pathways-and-guidelines/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-shoulder-resurfacing-htg227",
    "section": "Shoulder & Elbow",
    "type": "National guidance",
    "topic": "Shoulder resurfacing arthroplasty",
    "subGroup": "Published July 2010",
    "source": "NICE",
    "summary": "Reshaping the humeral head and fitting a resurfacing implant as an alternative to conventional shoulder replacement, designed for younger patients to preserve bone stock. Standard shoulder/reverse replacements remain more common.",
    "notes": "HTG227 (migrated from IPG354). Published July 2010.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg227.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg227",
        "label": "Published July 2010"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bess-subacromial-shoulder-pain",
    "section": "Shoulder & Elbow",
    "type": "Specialist society guidance",
    "topic": "Subacromial shoulder pain",
    "subGroup": "2025",
    "source": "BESS / BOA",
    "summary": "Pathway for subacromial shoulder pain (rotator cuff tendinopathy / impingement) - the commonest cause of shoulder pain. Covers diagnosis, conservative management (activity modification, analgesia, physiotherapy, subacromial injection) and thresholds for referral and surgery. Advises a minimum of 12 weeks structured physiotherapy and subacromial corticosteroid injection before considering arthroscopic subacromial decompression. The closest BESS document to a rotator cuff guideline; forms the clinical basis of NHS EBI List 2 restrictions on ASAD.",
    "notes": "2025 version - recently updated (uploaded March 2026).",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective",
      "Rehabilitation"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URL confirmed on the BESS official pathways index page; 2025 update confirmed by both passes.",
    "versions": [
      {
        "url": "https://bess.ac.uk/wp-content/uploads/2026/03/Subacromial-Shoulder-Pain-2025.pdf",
        "label": "2025"
      },
      {
        "url": "https://bess.ac.uk/patient-care-pathways-and-guidelines/",
        "label": "Fallback / index page"
      },
      {
        "url": "https://bess.ac.uk/wp-content/uploads/2020/06/Subacromial-Shoulder-Commissioning-Guide_final1.pdf",
        "label": "Commissioning Guide - Subacromial Pain (2015)"
      }
    ]
  },
  {
    "id": "bess-tennis-elbow",
    "section": "Shoulder & Elbow",
    "type": "Specialist society guidance",
    "topic": "Tennis elbow (lateral epicondylitis)",
    "subGroup": "2023",
    "source": "BESS / BOA",
    "summary": "Diagnosis, natural history (usually self-limiting), conservative management with eccentric loading physiotherapy and elbow clasps, injection therapy, and surgical indications. Advises against repetitive corticosteroid injections due to worse long-term outcomes and tendon atrophy; surgery is a last resort after 12+ months.",
    "notes": "Singh et al., BESS Patient Care Pathway, published 2023 in Shoulder & Elbow. One of the more recent BESS pathways.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective",
      "Rehabilitation"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URL confirmed on the BESS official pathways index page.",
    "versions": [
      {
        "url": "https://bess.ac.uk/wp-content/uploads/2023/11/singh-et-al-2023-bess-patient-care-pathway-tennis-elbow.pdf",
        "label": "2023"
      },
      {
        "url": "https://bess.ac.uk/patient-care-pathways-and-guidelines/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "girft-shoulder-arthroscopy-rotator-cuff",
    "section": "Shoulder & Elbow",
    "type": "National guidance",
    "topic": "Therapeutic shoulder arthroscopy - rotator cuff repair / subacromial decompression",
    "subGroup": "Withdrawn pending review",
    "source": "GIRFT (NHS England)",
    "summary": "Elective pathway for therapeutic shoulder arthroscopy. CURRENTLY UNDER REVIEW by GIRFT - no live document available. Interim: use the BESS subacromial shoulder pain pathway (2025) and NHS EBI List 2 criteria.",
    "notes": "Listed as 'Currently under review' on the GIRFT pathways index as of July 2026. Re-check periodically.",
    "status": "To source",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Elective"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "RE-CONFIRMED 29/07/2026 via the live official GIRFT pathways index (gettingitrightfirsttime.co.uk/academy-resources/pathways/, page last modified 27/05/2026): still listed as 'Currently under review'. No live pathway URL exists yet - this is not a broken link, it is an accurate reflection of GIRFT's own withdrawal status.",
    "versions": [
      {
        "url": "https://gettingitrightfirsttime.co.uk/academy-resources/pathways/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "girft-trauma-total-elbow-replacement",
    "section": "Shoulder & Elbow",
    "type": "National guidance",
    "topic": "Trauma total elbow replacement pathway",
    "subGroup": "January 2022",
    "source": "GIRFT (NHS England) - Orthopaedic Trauma",
    "summary": "Total elbow replacement in the trauma setting (typically distal humeral fracture in the elderly) - patient selection, timing and post-operative restrictions.",
    "notes": "January 2022.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Trauma"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URL from the GIRFT official pathways index.",
    "versions": [
      {
        "url": "https://gettingitrightfirsttime.co.uk/wp-content/uploads/2022/01/Orthopaedic-Trauma_2022-01-24_Pathway_Trauma-total-elbow-replacement.pdf",
        "label": "January 2022"
      },
      {
        "url": "https://gettingitrightfirsttime.co.uk/surgical_specialties/orthopaedic-surgery/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bess-traumatic-anterior-shoulder-instability",
    "section": "Shoulder & Elbow",
    "type": "Specialist society guidance",
    "topic": "Traumatic anterior shoulder instability (shoulder dislocation)",
    "subGroup": "2015",
    "source": "BESS / BOA",
    "summary": "Do NOT attempt pre-hospital reduction unless medically trained. Document a detailed neurological AND circulatory exam BEFORE relocation (medico-legal requirement) and again after. Two radiographic views required - AP obligatory plus axial (or modified axial/Wallace or lateral scapular if pain precludes). Safe reduction: consent, adequate analgesia +/- sedation, avoid rotational forces, post-reduction films in two planes, reassess and document neurovascular status. Neurological injury in ~13.5% (two-thirds axillary nerve); greater tuberosity fracture in ~16% (fix if over 5mm displaced after reduction, weekly films for 4 weeks); rotator cuff tears rise with age (41% aged 40-55, 71% aged 56-70, 100% over 70) - patients over 40 should have US/MRI. Recurrence inversely proportional to age: males under 20 have ~72-80% recurrence. Immobilisation beyond 1 week does not reduce recurrence; external rotation bracing NOT recommended.",
    "notes": "Published in Shoulder & Elbow 2015;7(3):214-226; lead author Peter Brownson. Co-developed with the BOA. CLOSES THE SHOULDER DISLOCATION GAP.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Emergencies",
      "Trauma",
      "Sports Injuries"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified against fetched PDF - full pathway confirmed.",
    "versions": [
      {
        "url": "https://bess.ac.uk/wp-content/uploads/2020/06/Traumatic_Anterior_Instability.pdf",
        "label": "2015"
      },
      {
        "url": "https://bess.ac.uk/patient-care-pathways-and-guidelines/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-ai-vertebral-fracture-htg760",
    "section": "Spine",
    "type": "National guidance",
    "topic": "AI for opportunistic detection of vertebral fragility fractures (EVA)",
    "subGroup": "Published Oct 2025",
    "source": "NICE",
    "summary": "Early value assessment of AI technologies (including BriefCase-Triage and CINA-VCF) to opportunistically detect asymptomatic vertebral fragility fractures on imaging performed for other reasons, routing undiagnosed patients into Fracture Liaison Services. Conditional recommendation while further evidence is generated.",
    "notes": "HTG760 (migrated from HTE34). Published Oct 2025. Early value assessment - not full guidance.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Bone Health",
      "Imaging"
    ],
    "priority": "medium",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg760.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg760",
        "label": "Published Oct 2025"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "spine-assessment-trauma",
    "section": "Spine",
    "type": "Specialist society guidance",
    "topic": "Assessment of the spine in the trauma patient (incl. cervical clearance)",
    "subGroup": "April 2025",
    "source": "BOA (BOASt)",
    "summary": "Assume spinal injury and maintain immobilisation until excluded by clinical assessment and imaging. Multidetector CT is first-line; cervical fracture/subluxation/ligamentous injury needs CT angiography (Denver criteria). MRI for obtunded patients, ambiguous CT or neurological signs. Initial radiology report within 1 hour.",
    "notes": "April 2025 - supersedes the two archived clearance BOASts (cervical + spinal).",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Emergencies",
      "Trauma"
    ],
    "priority": "high",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified against fetched PDF.",
    "versions": [
      {
        "url": "https://www.boa.ac.uk/asset/192A479C%2D1608%2D42F6%2D8D2A1802646ABC71/",
        "label": "April 2025"
      },
      {
        "url": "https://www.boa.ac.uk/standards-guidance/boasts.html",
        "label": "Fallback / index page"
      },
      {
        "url": "https://www.boa.ac.uk/asset/91FB4352-B7CB-4DB0-AC93DA65F0220C34/",
        "label": "Archived Cervical Spine Clearance"
      },
      {
        "url": "https://www.boa.ac.uk/asset/85DDCC65-F5F8-4993-AC435E7110486F4F/",
        "label": "Archived Spinal Clearance"
      }
    ]
  },
  {
    "id": "nice-balloon-kyphoplasty-htg108",
    "section": "Spine",
    "type": "National guidance",
    "topic": "Balloon kyphoplasty for vertebral compression fractures",
    "subGroup": "Published April 2006",
    "source": "NICE",
    "summary": "Inflating a balloon in a collapsed vertebra to restore height, then filling the cavity with cement, to relieve pain in severe osteoporotic fractures. Clinicians must follow cement preparation instructions to reduce embolisation risk. Filed by NICE under complications of cancer.",
    "notes": "HTG108 (migrated from IPG166, which replaced IPG20). Published April 2006. Distinct from TA279 (osteoporotic VCF appraisal, which sets funding thresholds).",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Bone Health",
      "Infection & Tumour"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg108.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg108",
        "label": "Published April 2006"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bass-condition-booklets",
    "section": "Spine",
    "type": "Specialist society guidance",
    "topic": "BASS condition booklets (17 spinal conditions)",
    "subGroup": "Current",
    "source": "BASS",
    "summary": "Seventeen structured condition booklets: cauda equina syndrome, cervical disc protrusion & radiculopathy, cervical stenosis & myelopathy, lumbar disc protrusions, lumbar spine stenosis, degenerative spondylolisthesis, lumbar spondylolysis & spondylitic spondylolisthesis, symptomatic degenerative lumbar disc disease, vertebral compression fracture (vertebroplasty/kyphoplasty), degenerative scoliosis, sacro-iliac joint pain, coccydynia, TLIF, ALIF, lumbar nerve root block, lumbar facet joint injection, lumbar discography and pars injection.",
    "notes": "Written for patients but clinically structured and accurate. CERVICAL STENOSIS & MYELOPATHY is here - a condition not otherwise covered in the catalogue and a genuine on-call miss (progressive myelopathy needs urgent referral).",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Emergencies",
      "Elective"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "All URLs from BASS official site navigation.",
    "versions": [
      {
        "url": "https://spinesurgeons.ac.uk/Booklets",
        "label": "Current"
      },
      {
        "url": "https://spinesurgeons.ac.uk/",
        "label": "Fallback / index page"
      },
      {
        "url": "https://spinesurgeons.ac.uk",
        "label": "Degenerative scoliosis: /Booklet-Degenerative-Scoliosis (prefix"
      }
    ]
  },
  {
    "id": "bass-patient-information",
    "section": "Spine",
    "type": "Specialist society guidance",
    "topic": "BASS patient information - acute back pain, CES, stenosis, scoliosis",
    "subGroup": "Current",
    "source": "BASS",
    "summary": "Eight patient-facing condition pages: acute back pain, cauda equina syndrome, coccydynia, lumbar discectomy and decompression, nerve root pain and treatment options, scoliosis, spinal stenosis, and the spine and MRI scanning. Useful for counselling and explaining why (or why not) an MRI is indicated.",
    "notes": "Public.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Rehabilitation"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "AUDIT 29/07/2026: this Primary URL (spinesurgeons.ac.uk/Patient-Information) is a genuine index page, distinct from the 17-item 'Booklets' index already captured in the bass-condition-booklets row. It lists 8 SEPARATE patient leaflets: Acute Back Pain, Cauda Equina Syndrome, Coccydinia and Operations for Coccygeal Pain, Lumbar Discectomy and Decompression, Nerve Root Pain and Some of the Treatment Options, Scoliosis, Spinal Stenosis, The Spine and MRI Scanning. Individual URLs for these 8 were NOT confirmed this pass - do not treat this row as covering all 8 topics individually yet.",
    "versions": [
      {
        "url": "https://spinesurgeons.ac.uk/Patient-Information",
        "label": "Current"
      },
      {
        "url": "https://spinesurgeons.ac.uk/",
        "label": "Fallback / index page"
      },
      {
        "url": "https://spinesurgeons.ac.uk",
        "label": "BASS NICE guidelines page: /NICE-Guidelines (prefix"
      }
    ]
  },
  {
    "id": "bass-british-spine-registry",
    "section": "Spine",
    "type": "Specialist society guidance",
    "topic": "British Spine Registry (BSR)",
    "subGroup": "Current",
    "source": "BASS / UKSSB",
    "summary": "The single recognised national spine registry for the UK, established by BASS. Collects outcome data (PROMs) across spinal surgery; mandatory for NHS spine surgeons to monitor implant safety and surgical efficacy.",
    "notes": "Registry infrastructure, not clinical guidance. Two URLs exist - the BASS landing page and the registry itself.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Local Overlay",
      "Service & Commissioning"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "BASS landing page from official navigation; canonical registry domain confirmed in pass 2.",
    "versions": [
      {
        "url": "https://www.britishspineregistry.com/",
        "label": "Current"
      },
      {
        "url": "https://spinesurgeons.ac.uk/BSR",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-chronic-pain-ng193",
    "section": "Spine",
    "type": "National guidance",
    "topic": "Chronic pain (primary and secondary) in over 16s",
    "subGroup": "Published April 2021",
    "source": "NICE",
    "summary": "Assessing all chronic pain and managing chronic primary pain in people 16 and over. Advises against initiating most pharmacological treatments including opioids and gabapentinoids for chronic primary pain; recommends supervised exercise, CBT/ACT and a single course of acupuncture. Use alongside condition-specific guidance such as NG59.",
    "notes": "NG193. Published April 2021. Developed with the Royal College of Physicians.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Rehabilitation",
      "Elective"
    ],
    "priority": "medium",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/ng193.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/ng193",
        "label": "Published April 2021"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "ros-vertebral-fracture-identification",
    "section": "Spine",
    "type": "Specialist society guidance",
    "topic": "Clinical guidance for the effective identification of vertebral fractures",
    "subGroup": "November 2017",
    "source": "Royal Osteoporosis Society",
    "summary": "ROS guidance on identifying vertebral fractures - a commonly missed diagnosis (roughly two-thirds never come to medical attention). Covers radiological detection including opportunistic identification on DXA and other imaging, and promotes training radiologists to actively report incidental vertebral compression fractures so patients can be routed to an FLS.",
    "notes": "November 2017. Pairs directly with the GIRFT VFF pathway (Nov 2025) and NICE HTG760 (AI detection) - together these three form a complete VFF picture.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Bone Health",
      "Trauma",
      "Imaging"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "PDF URL confirmed via search; hosted on theros.org.uk.",
    "versions": [
      {
        "url": "https://theros.org.uk/media/3daohfrq/ros-vertebral-fracture-guidelines-november-2017.pdf",
        "label": "November 2017"
      },
      {
        "url": "https://theros.org.uk/for-healthcare-professionals/clinical-quality-hub/clinical-quality-toolkits/clinical-publications-and-resources/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-craniocaudal-implant-vcf-htg422",
    "section": "Spine",
    "type": "National guidance",
    "topic": "Craniocaudal expandable implants for vertebral compression fracture",
    "subGroup": "Published Nov 2016",
    "source": "NICE",
    "summary": "Percutaneous insertion of an expandable implant to restore vertebral height in vertebral compression fracture. Evidence on safety and efficacy adequate to support use under standard clinical governance. Alternative to balloon kyphoplasty.",
    "notes": "HTG422 (migrated from IPG568). Published Nov 2016.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Bone Health",
      "Trauma"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg422.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg422",
        "label": "Published Nov 2016"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-eos-imaging-htg274",
    "section": "Spine",
    "type": "National guidance",
    "topic": "EOS 2D/3D imaging system",
    "subGroup": "Published Oct 2011, reviewed 2017",
    "source": "NICE",
    "summary": "The EOS low-dose biplanar imaging system producing full-body 2D and 3D skeletal images, used in scoliosis and lower-limb alignment assessment. Recommended particularly for children needing repeated serial imaging to minimise cumulative radiation.",
    "notes": "HTG274 (migrated from Diagnostics guidance DG1). Published Oct 2011; reviewed Jan 2017.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Paediatrics",
      "Imaging"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg274.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg274",
        "label": "Published Oct 2011, reviewed 2017"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "ebi-fusion-surgery-axial-low-back-pain",
    "section": "Spine",
    "type": "National guidance",
    "topic": "Fusion surgery for mechanical axial low back pain",
    "source": "NHS Evidence-Based Interventions (EBI) programme / Academy of Medical Royal Colleges",
    "summary": "Best Practice Guidance: spinal fusion is NOT indicated for isolated back pain without serious pathology, scoliosis, or SI joint dysfunction; supports the National Back Pain Pathway and STarT Back stratification. Uses the BRAN framework (Benefits, Risks, Alternatives, do Nothing) for shared decision-making.",
    "notes": "Published Jan 2020, last reviewed Sept 2024. Individual EBI intervention page (parent overview: nhs-ebi-programme).",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Elective"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "CONFIRMED 29/07/2026: fetched directly, exact deep link to this specific intervention page (not the generic EBI front page). Full content read - Summary/Recommendation/Rationale/Patient information/Coding/References sections all present and current as of the page's own 'last reviewed' date.",
    "versions": [
      {
        "url": "https://ebi.aomrc.org.uk/interventions/fusion-surgery-for-mechanical-axial-low-back-pain-2/",
        "label": "Current"
      },
      {
        "url": "https://ebi.aomrc.org.uk/specialty/musculoskeletal-spine/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-ifuse-si-joint-htg488",
    "section": "Spine",
    "type": "National guidance",
    "topic": "iFuse for chronic sacroiliac joint pain",
    "subGroup": "Published 2018, updated Aug 2022",
    "source": "NICE",
    "summary": "The iFuse implant system for minimally invasive sacroiliac joint fusion in patients with severe chronic SI joint pain refractory to conservative management. Cost-effective compared with conservative management alone.",
    "notes": "HTG488 (migrated from MTG39). Published 2018; updated Aug 2022 (added iFuse-3D).",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective",
      "Rehabilitation"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg488.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg488",
        "label": "Published 2018, updated Aug 2022"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "ebi-injections-isolated-low-back-pain",
    "section": "Spine",
    "type": "National guidance",
    "topic": "Injections for isolated lower back pain without sciatica",
    "source": "NHS Evidence-Based Interventions (EBI) programme / Academy of Medical Royal Colleges",
    "summary": "Statutory EBI guidance: medial branch blocks may be used diagnostically only; facet joint injections, intradiscal therapy, PRP, stem cell therapy, prolotherapy, trigger point injections and epidural steroids should NOT be offered for isolated low back pain. Uses the BRAN framework (Benefits, Risks, Alternatives, do Nothing) for shared decision-making.",
    "notes": "Published Jan 2020, last reviewed Sept 2024. Individual EBI intervention page (parent overview: nhs-ebi-programme). Explicitly does not cover epidurals/nerve root blocks for acute severe radiculopathy.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Elective"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "CONFIRMED 29/07/2026: fetched directly, exact deep link to this specific intervention page (not the generic EBI front page). Full content read - Summary/Recommendation/Rationale/Patient information/Coding/References sections all present and current as of the page's own 'last reviewed' date.",
    "versions": [
      {
        "url": "https://ebi.aomrc.org.uk/interventions/injections-for-nonspecific-low-back-pain-without-sciatica-2/",
        "label": "Current"
      },
      {
        "url": "https://ebi.aomrc.org.uk/specialty/musculoskeletal-spine/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-lateral-interbody-fusion-htg431",
    "section": "Spine",
    "type": "National guidance",
    "topic": "Lateral interbody fusion in the lumbar spine for low back pain",
    "subGroup": "Published Feb 2017",
    "source": "NICE",
    "summary": "Removing a damaged disc and fusing parts of the lumbar spine via a lateral approach (XLIF/LLIF). Requires standard governance and specific surgeon training in the lateral retroperitoneal approach to avoid nerve plexus injury.",
    "notes": "HTG431 (migrated from IPG574, replacing IPG321). Published Feb 2017.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg431.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg431",
        "label": "Published Feb 2017"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-low-back-pain-ng59",
    "section": "Spine",
    "type": "National guidance",
    "topic": "Low back pain and sciatica in over 16s",
    "subGroup": "Published 2016, updated Dec 2020",
    "source": "NICE",
    "summary": "Assessment and management of low back pain and sciatica, outlining physical, psychological, pharmacological and surgical treatments. Includes risk stratification. Imaging is not routinely recommended in non-specialist settings unless red flags are present. Covers elective lumbar decompression/fusion indications.",
    "notes": "NG59. Published Nov 2016; last updated Dec 2020 (sciatica pharmacological management). Key to reducing unnecessary spinal MRI.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective",
      "Rehabilitation"
    ],
    "priority": "high",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/ng59.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/ng59",
        "label": "Published 2016, updated Dec 2020"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "ebi-low-back-pain-imaging",
    "section": "Spine",
    "type": "National guidance",
    "topic": "Low back pain imaging",
    "source": "NHS Evidence-Based Interventions (EBI) programme / Academy of Medical Royal Colleges",
    "summary": "Best Practice Guidance: do not routinely image low back pain in the absence of red flags; image only if serious underlying pathology (cancer, infection, trauma, cord injury, inflammatory disease) is suspected. Cauda equina imaging must not be delayed. Uses the BRAN framework (Benefits, Risks, Alternatives, do Nothing) for shared decision-making.",
    "notes": "Published Jan 2020, last reviewed Sept 2024. Individual EBI intervention page (parent overview: nhs-ebi-programme). Directly relevant to on-call triage - references the GIRFT spinal report's 24/7 emergency MRI recommendation for suspected cauda equina.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Elective",
      "Emergencies",
      "Quick Reference"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "CONFIRMED 29/07/2026: fetched directly, exact deep link to this specific intervention page (not the generic EBI front page). Full content read - Summary/Recommendation/Rationale/Patient information/Coding/References sections all present and current as of the page's own 'last reviewed' date.",
    "versions": [
      {
        "url": "https://ebi.aomrc.org.uk/interventions/low-back-pain-imaging-2/",
        "label": "Current"
      },
      {
        "url": "https://ebi.aomrc.org.uk/specialty/musculoskeletal-spine/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "ebi-lumbar-discectomy",
    "section": "Spine",
    "type": "National guidance",
    "topic": "Lumbar discectomy",
    "source": "NHS Evidence-Based Interventions (EBI) programme / Academy of Medical Royal Colleges",
    "summary": "Best Practice Guidance: most radiculopathy improves non-operatively within 6 weeks; discectomy may be offered for compressive nerve root signs/symptoms persisting 3 months despite optimal non-operative care. Deteriorating neurology needs urgent referral, not this pathway. Uses the BRAN framework (Benefits, Risks, Alternatives, do Nothing) for shared decision-making.",
    "notes": "Published Jan 2020, last reviewed Sept 2024. Individual EBI intervention page (parent overview: nhs-ebi-programme). Explicitly excludes cauda equina/progressive neurological deficit - those need urgent same-day pathway (see girft cauda equina / low-back-pain-imaging rows).",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Elective"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "CONFIRMED 29/07/2026: fetched directly, exact deep link to this specific intervention page (not the generic EBI front page). Full content read - Summary/Recommendation/Rationale/Patient information/Coding/References sections all present and current as of the page's own 'last reviewed' date.",
    "versions": [
      {
        "url": "https://ebi.aomrc.org.uk/interventions/lumbar-discectomy/",
        "label": "Current"
      },
      {
        "url": "https://ebi.aomrc.org.uk/specialty/musculoskeletal-spine/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "girft-lumbar-facet-joint-injection",
    "section": "Spine",
    "type": "National guidance",
    "topic": "Lumbar medial branch block / facet joint injection pathway",
    "subGroup": "January 2023",
    "source": "GIRFT (NHS England) - Spinal Services",
    "summary": "Indications and patient selection for lumbar medial branch block and facet joint injection in facetogenic low back pain. Reflects the GIRFT finding that many patients still receive these injections despite NICE guidance that they have limited clinical value; recommends long-term physical and psychological rehabilitation instead.",
    "notes": "January 2023. Read alongside NICE NG59.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Elective",
      "Rehabilitation"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "CONFIRMED 29/07/2026: this exact .drawio.html URL is live and listed on the official GIRFT pathways index (gettingitrightfirsttime.co.uk/academy-resources/pathways/, fetched directly). Format is confirmed correct, just not machine-readable as plain text - it opens correctly in a browser.",
    "versions": [
      {
        "url": "https://gettingitrightfirsttime.co.uk/wp-content/uploads/2023/01/Lumbar-Medial-Branch-Block-Facet-Joint-Injections-pathway.drawio-1.html",
        "label": "January 2023"
      },
      {
        "url": "https://gettingitrightfirsttime.co.uk/surgical_specialties/spinal-surgery/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "girft-lumbar-nerve-root-block",
    "section": "Spine",
    "type": "National guidance",
    "topic": "Lumbar nerve root block / epidural pathway",
    "subGroup": "January 2023",
    "source": "GIRFT (NHS England) - Spinal Services",
    "summary": "Indications, patient selection and place of lumbar nerve root block and epidural injection in the conservative management ladder for radicular pain, reinforcing NICE guidance on appropriate use for radicular rather than non-specific back pain.",
    "notes": "January 2023.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Elective",
      "Rehabilitation"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "CONFIRMED 29/07/2026: this exact .drawio.html URL is live and listed on the official GIRFT pathways index (gettingitrightfirsttime.co.uk/academy-resources/pathways/, fetched directly). Format is confirmed correct, just not machine-readable as plain text - it opens correctly in a browser.",
    "versions": [
      {
        "url": "https://gettingitrightfirsttime.co.uk/wp-content/uploads/2023/01/Lumbar-Nerve-Root-Block-Epidural-pathway.drawio-1.html",
        "label": "January 2023"
      },
      {
        "url": "https://gettingitrightfirsttime.co.uk/surgical_specialties/spinal-surgery/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "ebi-lumbar-radiofrequency-facet-denervation",
    "section": "Spine",
    "type": "National guidance",
    "topic": "Lumbar radiofrequency facet joint denervation",
    "source": "NHS Evidence-Based Interventions (EBI) programme / Academy of Medical Royal Colleges",
    "summary": "Best Practice Guidance: RFD (dorsal rhizotomy) is an adjunct for chronic low back pain, in line with NICE NG59, only after non-operative treatment has failed and a diagnostic medial branch block gives a positive response. Uses the BRAN framework (Benefits, Risks, Alternatives, do Nothing) for shared decision-making.",
    "notes": "Published Jan 2020, last reviewed Sept 2024. Individual EBI intervention page (parent overview: nhs-ebi-programme). Complements bscos/bpt-level detail - clarifies that facet joint injections themselves are no longer recommended by NICE or GIRFT (medial branch block is diagnostic, not therapeutic).",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Elective"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "CONFIRMED 29/07/2026: fetched directly, exact deep link to this specific intervention page (not the generic EBI front page). Full content read - Summary/Recommendation/Rationale/Patient information/Coding/References sections all present and current as of the page's own 'last reviewed' date.",
    "versions": [
      {
        "url": "https://ebi.aomrc.org.uk/interventions/lumbar-radiofrequency-facet-joint-denervation/",
        "label": "Current"
      },
      {
        "url": "https://ebi.aomrc.org.uk/specialty/musculoskeletal-spine/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-si-joint-fusion-htg436",
    "section": "Spine",
    "type": "National guidance",
    "topic": "Minimally invasive sacroiliac joint fusion for chronic SI pain",
    "subGroup": "Published April 2017",
    "source": "NICE",
    "summary": "Fixing the sacrum to the ilium with 2-3 metal implants for chronic sacroiliac pain, provided standard arrangements for clinical governance, consent and audit are in place.",
    "notes": "HTG436 (migrated from IPG578). Published April 2017. Precursor framework to the specific iFuse guidance.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg436.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg436",
        "label": "Published April 2017"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-lumbar-neurostimulation-htg641",
    "section": "Spine",
    "type": "National guidance",
    "topic": "Neurostimulation of lumbar muscles for refractory chronic low back pain",
    "subGroup": "Published Sept 2022",
    "source": "NICE",
    "summary": "Implanting a pulse generator to stimulate the lumbar multifidus muscles for refractory non-specific chronic low back pain. Evidence on efficacy is limited in quantity and quality - research use only.",
    "notes": "HTG641 (migrated from IPG739). Published Sept 2022; under review as of April 2026 (GID-HTG10168).",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Rehabilitation"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg641.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg641",
        "label": "Published Sept 2022"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "girft-acdf-disc-replacement",
    "section": "Spine",
    "type": "National guidance",
    "topic": "One/two level anterior cervical discectomy & fusion (ACDF) / disc replacement",
    "subGroup": "January 2023",
    "source": "GIRFT (NHS England) - Spinal Services",
    "summary": "Elective pathway for one or two level ACDF and cervical disc replacement - indications, patient selection, pre-operative workup and enhanced recovery protocols.",
    "notes": "January 2023.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Elective"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "CONFIRMED 29/07/2026: this exact .drawio.html URL is live and listed on the official GIRFT pathways index (gettingitrightfirsttime.co.uk/academy-resources/pathways/, fetched directly). Format is confirmed correct, just not machine-readable as plain text - it opens correctly in a browser.",
    "versions": [
      {
        "url": "https://gettingitrightfirsttime.co.uk/wp-content/uploads/2023/01/One-or-Two-Level-Anterior-Cervical-Discectomy-Fusion-Disc-Replacement-pathway.drawio-1.html",
        "label": "January 2023"
      },
      {
        "url": "https://gettingitrightfirsttime.co.uk/surgical_specialties/spinal-surgery/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "girft-posterior-fusion",
    "section": "Spine",
    "type": "National guidance",
    "topic": "One/two level posterior fusion surgery (PLF / TLIF / PLIF)",
    "subGroup": "January 2023",
    "source": "GIRFT (NHS England) - Spinal Services",
    "summary": "Elective pathway for one or two level posterior lumbar fusion (posterolateral fusion, TLIF, PLIF) - indications, patient selection and perioperative pathway, focusing on appropriate patient selection and reducing implant cost variation.",
    "notes": "January 2023.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Elective"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "CONFIRMED 29/07/2026: this exact .drawio.html URL is live and listed on the official GIRFT pathways index (gettingitrightfirsttime.co.uk/academy-resources/pathways/, fetched directly). Format is confirmed correct, just not machine-readable as plain text - it opens correctly in a browser.",
    "versions": [
      {
        "url": "https://gettingitrightfirsttime.co.uk/wp-content/uploads/2023/01/One-or-Two-Level-Posterior-Fusion-surgery-PLF-TLIF-PLIF-pathway.drawio-1.html",
        "label": "January 2023"
      },
      {
        "url": "https://gettingitrightfirsttime.co.uk/surgical_specialties/spinal-surgery/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-percutaneous-vertebroplasty-htg3",
    "section": "Spine",
    "type": "National guidance",
    "topic": "Percutaneous vertebroplasty (spinal metastases)",
    "subGroup": "Published Sept 2003",
    "source": "NICE",
    "summary": "Injecting bone cement into a vertebra to relieve pain and stabilise the fracture site, for spinal metastases, myeloma and osteoporosis. Use limited to patients whose pain is refractory to conservative treatment. Read alongside NG234.",
    "notes": "HTG3 (migrated from IPG12 in January 2026). Published Sept 2003. Metastatic context - distinct from TA279.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Infection & Tumour"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg3.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg3",
        "label": "Published Sept 2003"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "girft-posterior-lumbar-decompression-discectomy",
    "section": "Spine",
    "type": "National guidance",
    "topic": "Posterior lumbar decompression / discectomy pathway",
    "subGroup": "January 2023",
    "source": "GIRFT (NHS England) - Spinal Services",
    "summary": "Elective pathway for posterior lumbar decompression and discectomy - patient selection, conservative management first, imaging, surgical indications and post-operative care. Demonstrates the safety and efficacy of same-day discharge.",
    "notes": "January 2023.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Elective"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "CONFIRMED 29/07/2026: this exact .drawio.html URL is live and listed on the official GIRFT pathways index (gettingitrightfirsttime.co.uk/academy-resources/pathways/, fetched directly). Format is confirmed correct, just not machine-readable as plain text - it opens correctly in a browser.",
    "versions": [
      {
        "url": "https://gettingitrightfirsttime.co.uk/wp-content/uploads/2023/01/Posterior-Lumbar-Decompression-Discectomy-pathway.drawio-2.html",
        "label": "January 2023"
      },
      {
        "url": "https://gettingitrightfirsttime.co.uk/surgical_specialties/spinal-surgery/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "girft-spinal-services-report",
    "section": "Spine",
    "type": "National guidance",
    "topic": "Spinal services - GIRFT national specialty report",
    "subGroup": "January 2019",
    "source": "GIRFT (NHS England)",
    "summary": "National specialty report led by Mike Hutton (2019, from visits to 127 spinal units). Found significant unwarranted variation in CES detection, imaging timing and surgical treatment - this report plus the 2021 HSIB safety review directly generated the National Suspected Cauda Equina Pathway. Recommends replacing short-term pain relief injections (including facet joint injections) with long-term physical and psychological rehabilitation. Notes 23% of litigated spinal surgery claims in England relate to CES.",
    "notes": "January 2019. The parent document behind the CES pathway.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Emergencies",
      "Service & Commissioning"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Specialty page verified; report referenced in the CES PDF foreword.",
    "versions": [
      {
        "url": "https://gettingitrightfirsttime.co.uk/surgical_specialties/spinal-surgery/",
        "label": "January 2019"
      },
      {
        "url": "https://gettingitrightfirsttime.co.uk/surgical_specialties/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bss-ais-sports-consensus",
    "section": "Spine",
    "type": "Specialist society guidance",
    "topic": "Sports and physical activity after post-operative intervention for adolescent idiopathic scoliosis (AIS)",
    "subGroup": "Published PLOS ONE 23 Feb 2026 (DOI 10.1371/journal.pone.0322346); preprint Mar 2025",
    "source": "British Scoliosis Society (BSS) / International Delphi",
    "summary": "International Delphi consensus outlining safe parameters for sports, exercise and physical activity participation for patients recovering from post-operative intervention for adolescent idiopathic scoliosis.",
    "notes": "March 2025. NEWLY ADDED - closes the British Scoliosis Society provider gap. Preprint/medRxiv source - confirm final peer-reviewed citation before injection.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Paediatrics",
      "Sports Injuries"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "UPGRADED 29/07/2026: the final peer-reviewed version is now published open access - Tucker S et al., 'International consensus on sports, exercise, and physical activity participation during post-operative interventions for AIS: An e-Delphi study', PLOS ONE, 23 Feb 2026. Primary URL switched from the medRxiv preprint to this permanent open-access journal record.",
    "versions": [
      {
        "url": "https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0322346",
        "label": "Published PLOS ONE 23 Feb 2026 (DOI 10.1371/journal.pone.0322346); preprint Mar 2025"
      },
      {
        "url": "https://www.ukssb.com/about",
        "label": "Fallback / index page"
      },
      {
        "url": "https://www.medrxiv.org/content/10.1101/2025.03.23.25324479v1",
        "label": "Original medRxiv preprint (Mar 2025, superseded by the PLOS ONE version)"
      }
    ]
  },
  {
    "id": "nice-transaxial-fusion-htg478",
    "section": "Spine",
    "type": "National guidance",
    "topic": "Transaxial interbody lumbosacral fusion for severe chronic low back pain",
    "subGroup": "Published July 2018",
    "source": "NICE",
    "summary": "Removing a damaged disc via a small cut at the base of the spine and replacing it with an implant. Safety evidence shows serious but well-recognised complications; efficacy adequate under standard governance, consent and audit. Seldom used routinely in the NHS.",
    "notes": "HTG478 (migrated from IPG620, replacing IPG387). Published July 2018.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg478.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg478",
        "label": "Published July 2018"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "traumatic-spinal-cord-injury",
    "section": "Spine",
    "type": "Specialist society guidance",
    "topic": "Traumatic spinal cord injury",
    "subGroup": "November 2022",
    "source": "BOA (BOASt)",
    "summary": "Protect the spine, arrange whole-spine MRI after initial trauma CT, and record a full ISNCSCI neurological exam within 2 hours of admission. Every receiving hospital needs a named linked Spinal Cord Injury Centre and Specialised Spinal Surgery Centre; transfer within 24 hours unless best interests dictate otherwise.",
    "notes": "November 2022.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Emergencies",
      "Trauma"
    ],
    "priority": "high",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified against fetched PDF.",
    "versions": [
      {
        "url": "https://www.boa.ac.uk/asset/0789B509%2D99C6%2D4385%2DB4C3C54E2B200C69/",
        "label": "November 2022"
      },
      {
        "url": "https://www.boa.ac.uk/standards-guidance/boasts.html",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "ukssb-spine-societies-board",
    "section": "Spine",
    "type": "Specialist society guidance",
    "topic": "UK Spine Societies Board (UKSSB)",
    "subGroup": "Current",
    "source": "UKSSB",
    "summary": "The umbrella board bringing together the UK's four national spinal societies - BASS, the British Scoliosis Society (BSS), the Society for Back Pain Research (SBPR) and the British Association of Spinal Cord Injury Specialists (BASCIS) - plus BOA and SBNS representatives. Coordinates national clinical audits, training standards and registry governance; organises BritSpine.",
    "notes": "Registered charity No. 1204121. A coordinating body - clinical guidance sits with the constituent societies. BASCIS is a new source provider not previously on the list - relevant to the traumatic spinal cord injury entry.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Service & Commissioning"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "AUDIT 29/07/2026: current URL (ukssb.com/about) is an organisational 'About' page, not a guideline. UKSSB's actual clinical output - the National Back Pain and Radicular Pain Pathway - is already linked directly elsewhere in this sheet (used as a reference in several EBI rows), which suggests this row may be redundant with, or should point to, that pathway document rather than the About page.",
    "versions": [
      {
        "url": "https://www.ukssb.com/about",
        "label": "Current"
      },
      {
        "url": "https://spinesurgeons.ac.uk/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "ebi-vertebral-augmentation-osteoporotic-fractures",
    "section": "Spine",
    "type": "National guidance",
    "topic": "Vertebral augmentation for painful osteoporotic vertebral fractures",
    "source": "NHS Evidence-Based Interventions (EBI) programme / Academy of Medical Royal Colleges",
    "summary": "Best Practice Guidance: vertebroplasty/kyphoplasty may be offered case-by-case per NICE TA279, for severe ongoing pain (VAS ≥7) after a recent unhealed fracture despite optimal pain management, decided by MDT, alongside bone-health treatment. Uses the BRAN framework (Benefits, Risks, Alternatives, do Nothing) for shared decision-making.",
    "notes": "Published Jan 2020, last reviewed Sept 2024. Individual EBI intervention page (parent overview: nhs-ebi-programme). Directly relevant to the girft-vertebral-fragility-fracture pathway and Bone Health section - cross-reference both.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Elective",
      "Bone Health"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "CONFIRMED 29/07/2026: fetched directly, exact deep link to this specific intervention page (not the generic EBI front page). Full content read - Summary/Recommendation/Rationale/Patient information/Coding/References sections all present and current as of the page's own 'last reviewed' date.",
    "versions": [
      {
        "url": "https://ebi.aomrc.org.uk/interventions/vertebral-augmentation-for-painful-osteoporotic-vertebral-fractures/",
        "label": "Current"
      },
      {
        "url": "https://ebi.aomrc.org.uk/specialty/musculoskeletal-spine/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "girft-vertebral-fragility-fracture",
    "section": "Spine",
    "type": "National guidance",
    "topic": "Vertebral fragility fracture (VFF) pathway",
    "subGroup": "November 2025",
    "source": "GIRFT (NHS England) - Spinal Services",
    "summary": "Recognition and management of vertebral fragility fractures - a commonly missed diagnosis (two thirds of spinal fractures never come to medical attention). Covers identification including opportunistic detection on imaging, bone health assessment, and referral into fracture liaison services.",
    "notes": "FINAL, November 2025 - recent. Links to NICE CG146/QS149, ROS VFF guidance and NICE HTG760 (AI detection).",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Bone Health",
      "Trauma",
      "Older Adult"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "CONFIRMED 29/07/2026: this exact .drawio.html URL is live and listed on the official GIRFT pathways index (gettingitrightfirsttime.co.uk/academy-resources/pathways/, fetched directly). Format is confirmed correct, just not machine-readable as plain text - it opens correctly in a browser.",
    "versions": [
      {
        "url": "https://gettingitrightfirsttime.co.uk/wp-content/uploads/2025/11/VFF-pathway-FINAL-November-2025.drawio.html",
        "label": "November 2025"
      },
      {
        "url": "https://gettingitrightfirsttime.co.uk/surgical_specialties/spinal-surgery/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-vertebroplasty-kyphoplasty-ta279",
    "section": "Spine",
    "type": "National guidance",
    "topic": "Vertebroplasty & balloon kyphoplasty for osteoporotic vertebral compression fractures",
    "subGroup": "Published April 2013",
    "source": "NICE",
    "summary": "Percutaneous vertebroplasty and percutaneous balloon kyphoplasty for osteoporotic vertebral compression fractures in adults - only for patients with severe ongoing pain after a recent unhealed fracture despite optimal pain management, with pain confirmed at the fracture level on imaging.",
    "notes": "TA279. Published April 2013; last reviewed Jan 2016. Heavily audited - requires proof of chronicity and failure of conservative care.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Bone Health",
      "Trauma"
    ],
    "priority": "medium",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/ta279.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/ta279",
        "label": "Published April 2013"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "girft-adult-orthopaedic-trauma-report",
    "section": "Trauma",
    "type": "National guidance",
    "topic": "Adult orthopaedic trauma - GIRFT national specialty report",
    "subGroup": "Jan 2024 (FINAL published May 2026)",
    "source": "GIRFT (NHS England)",
    "summary": "National specialty report by Bob Handley, from deep dives with 126 trusts. Ten recommendations centred on equity of care - BPT, NICE and BOASt standards should apply to ALL orthopaedic trauma patients, not just the monitored hip fracture cohort. Only ~30% of hip fracture patients reach an orthopaedic ward within 4 hours (6% by Feb 2023); wide variation in weekend orthogeriatric, physio and theatre provision; 'orphan conditions' (chest injuries, pubic rami fractures, non-surgical head injuries) need explicit local pathways. Day case benchmarks: 60% zero-night-stay for wrist fractures, 25% for ankle fractures.",
    "notes": "Report dated January 2024; the FINAL published PDF was posted May 2026 (second pass). Service-improvement/governance document. Cross-references NICE CG124, NG37, NG38 and multiple BOASts.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Bone Health",
      "Local Overlay",
      "Service & Commissioning"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified against fetched PDF; May 2026 final publication confirmed by second pass.",
    "versions": [
      {
        "url": "https://gettingitrightfirsttime.co.uk/wp-content/uploads/2026/05/Adult-Orthopaedic-Trauma-Nov24L-FINAL.pdf",
        "label": "Jan 2024 (FINAL published May 2026)"
      },
      {
        "url": "https://gettingitrightfirsttime.co.uk/surgical_specialties/orthopaedic-surgery/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-ai-fracture-detection-htg739",
    "section": "Trauma",
    "type": "National guidance",
    "topic": "AI to help detect fractures on X-rays in urgent care (EVA)",
    "subGroup": "Published Jan 2025 (verify)",
    "source": "NICE",
    "summary": "Early value assessment of AI technologies (e.g. Gleamer BoneView, Rayvolve) that flag fractures on X-rays in urgent care as an adjunct to clinician review, to reduce missed appendicular fractures. Conditional recommendation while evidence is generated.",
    "notes": "HTG739 (migrated from HTE20). Published Jan 2025 (second pass suggests March 2024 - VERIFY DATE). Directly relevant to ED/VFC workflows.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Emergencies",
      "Imaging"
    ],
    "priority": "medium",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg739.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg739",
        "label": "Published Jan 2025 (verify)"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "blrs-limb-reconstruction",
    "section": "Trauma",
    "type": "Specialist society guidance",
    "topic": "Best Practice in Limb Reconstruction Surgery in the UK",
    "subGroup": "December 2025",
    "source": "BLRS / BOA",
    "summary": "Collaborative BLRS/BOA framework defining best practice for patients undergoing limb reconstruction surgery for congenital deformity, trauma sequelae, non-union and fracture-related infection.",
    "notes": "December 2025. NEWLY ADDED - closes the BLRS provider gap; BLRS was not on the original source list.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Infection & Tumour",
      "Limb Reconstruction"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Verified via BOA/BLRS repository (second pass).",
    "versions": [
      {
        "url": "https://www.boa.ac.uk/resource/best-practice-in-limb-reconstruction-surgery-in-the-united-kingdom.html",
        "label": "December 2025"
      },
      {
        "url": "https://www.boa.ac.uk/standards-guidance.html",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "boa-bgs-blue-book",
    "section": "Trauma",
    "type": "Specialist society guidance",
    "topic": "BOA/BGS Blue Book - care of patients with fragility fracture",
    "subGroup": "2007",
    "source": "BOA / British Geriatrics Society",
    "summary": "The foundational 2007 joint BOA/BGS publication setting out six evidence-based standards for fragility fracture care. The NHFD was originally designed to audit against these standards and GIRFT still cites it as a reference standard for secondary fracture prevention.",
    "notes": "2007. Historical but still the underpinning framework for NHFD and BPT. Two hosted copies exist (BGS and BOA).",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Bone Health",
      "Older Adult"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-23",
    "linkVerificationNotes": "URL cited and verified within the GIRFT Adult Orthopaedic Trauma report (footnote 12). | 2026-08-23 remediation: dead fallback (boa.ac.uk/wp-content/uploads/2014/12/blue_book.pdf, HTTP 404 — BOA no longer hosts a copy). The primary already pointed at the live BGS-hosted PDF, so the fallback was repointed at the BGS Blue Book landing page (HTTP 200) rather than duplicating the primary. The Blue Book is a joint BOA/BGS document, so a BGS host is consistent with this row's stated source.",
    "versions": [
      {
        "url": "https://www.bgs.org.uk/sites/default/files/content/attachment/2018-05-02/Blue%20Book%20on%20fragility%20fracture%20care.pdf",
        "label": "2007"
      },
      {
        "url": "https://www.bgs.org.uk/care-of-patients-with-fragility-fracture-blue-book",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "older-frail-trauma-patient",
    "section": "Trauma",
    "type": "Specialist society guidance",
    "topic": "Care of the older or frail orthopaedic trauma patient",
    "subGroup": "May 2019",
    "source": "BOA (BOASt)",
    "summary": "Older/frail trauma patients need orthogeriatric co-management, prompt surgery, and attention to bone health, delirium and pressure care. All surgery in the frail patient should allow full weight-bearing for activities of daily living and be performed within 36 hours of admission. Frames the frailty pathway beyond hip fracture alone.",
    "notes": "May 2019. Focus on non-hip fragility fractures; pairs with the GIRFT NAFF pathway.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Bone Health",
      "Older Adult"
    ],
    "priority": "medium",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "200 response, non-colliding GUID. Content-check pending.",
    "versions": [
      {
        "url": "https://www.boa.ac.uk/asset/A30F1F4C-210E-4EE2-98FD14A8A04093FE/",
        "label": "May 2019"
      },
      {
        "url": "https://www.boa.ac.uk/standards-guidance/boasts.html",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-complex-fractures-ng37",
    "section": "Trauma",
    "type": "National guidance",
    "topic": "Complex fractures - assessment and management",
    "subGroup": "Published 2016, updated Nov 2022",
    "source": "NICE",
    "summary": "Covers pelvic fractures, open fractures and severe ankle fractures (pilon / intra-articular distal tibia) across pre-hospital, ED and major trauma centre settings. Mandates major trauma network pathways, pre-hospital triage, early senior involvement and vascular injury assessment.",
    "notes": "NG37. Published Feb 2016; last updated Nov 2022 (open-fracture dressings). Read alongside NG38, NG39, NG40, NG41 and BOASt 4.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Emergencies",
      "Foot & Ankle"
    ],
    "priority": "high",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/ng37.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/ng37",
        "label": "Published 2016, updated Nov 2022"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-exogen-htg296",
    "section": "Trauma",
    "type": "National guidance",
    "topic": "EXOGEN ultrasound bone healing system for long-bone non-union/delayed healing",
    "subGroup": "Reviewed Oct 2019",
    "source": "NICE",
    "summary": "The EXOGEN LIPUS system for long-bone fractures with non-union (failure to heal after 9 months) or delayed healing. Recommended as cost-saving. Heavily used in fracture clinics as a pre-operative alternative.",
    "notes": "HTG296 (migrated from MTG12). Published Jan 2013; reviewed Oct 2019 (cost update).",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Infection & Tumour",
      "Limb Reconstruction"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg296.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg296",
        "label": "Reviewed Oct 2019"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bpt-fragility-hip-femur-fracture",
    "section": "Trauma",
    "type": "National guidance",
    "topic": "Fragility Hip and Femur Fracture Best Practice Tariff (BPT)",
    "subGroup": "FY2026/27 NHS Payment Scheme, Annex C, Section 14 (pp.60-62) - current",
    "source": "NHS England",
    "summary": "Payment mechanism with seven criteria, ALL of which must be met: (a) surgery within 36 hours of ED arrival or diagnosis; (b) geriatrician assessment (consultant/NCCG/ST3+) within 72 hours; (c) falls and bone health assessments; (d) pre-operative 4AT recorded in NHFD; (e) nutritional assessment; (f) repeat 4AT delirium assessment during admission; (g) physiotherapist assessment day of or day after surgery. NHFD is the sole recognised data source for compliance.",
    "notes": "LINK NEEDS CONFIRMING FOR FY2026/27. The original project document cited the 2025/26 NHS Payment Scheme (Annex C, Section 14). Pass 2 supplied the 25/26 Annex B guidance URL below. We are now in FY2026/27 - search 'NHS Payment Scheme Annex C best practice tariffs 2026/27' and confirm before injecting as current.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Bone Health",
      "Local Overlay",
      "Service & Commissioning"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-23",
    "linkVerificationNotes": "STALE-YEAR RISK RESOLVED 29/07/2026: fetched the FY2026/27 NHS Payment Scheme Annex C: Guidance on best practice tariffs directly (published by NHS England 2026); Section 14 'Fragility hip and femur fracture' confirmed present (pp.60-62), with full current BPT criteria (36-hour time to surgery, geriatrician assessment within 72h, 4AT screening, etc). Primary URL updated to this current document; the FY2025/26 Annex B page previously used is now superseded and moved to Additional Version Links. | 2026-08-23 remediation: dead primary (HTTP 404) replaced. NHS England republished the 2026/27 NHS Payment Scheme in August 2026 as a pay-award update, prefixing every annexe filename with PRN02348-...-pay-award-. New Annex C URL confirmed HTTP 200. CAUTION: this is still a dated wp-content/uploads path and will break again at the next republication. Reviewed 2026-08-23: the direct PDF was deliberately RETAINED as primary (with the evergreen /pay-syst/ hub as fallback) so users land on the document itself — expect to re-point this link at each annual republication. | 2026-08-23 remediation: dead fallback (england.nhs.uk/publication/nhs-payment-scheme/, HTTP 404) replaced with the evergreen NHS Payment Scheme hub (HTTP 200), deliberately chosen over the year-stamped 2026/27 page so it does not rot annually.",
    "versions": [
      {
        "url": "https://www.england.nhs.uk/wp-content/uploads/2026/03/PRN02348-26-27-nhs-payment-scheme-pay-award-annex-c-best-practice-tariffs.pdf",
        "label": "FY2026/27 NHS Payment Scheme, Annex C, Section 14 (pp.60-62) - current"
      },
      {
        "url": "https://www.england.nhs.uk/pay-syst/nhs-payment-scheme/",
        "label": "Fallback / index page"
      },
      {
        "url": "https://www.england.nhs.uk/long-read/25-26-nhsps-annex-b-guidance-on-currencies/",
        "label": "Superseded FY2025/26 Annex B guidance (previous Primary URL)"
      }
    ]
  },
  {
    "id": "nice-hip-fracture-cg124",
    "section": "Trauma",
    "type": "National guidance",
    "topic": "Hip fracture (NOF) management",
    "subGroup": "Published 2011, updated 2023",
    "source": "NICE",
    "summary": "Hip fracture management in adults from admission to community return. Emphasises early surgery (day of or day after admission, within 36 hours) and coordinated care via a multidisciplinary Hip Fracture Programme. Includes imaging for occult fracture, analgesia, anaesthesia, implant choice and mobilisation.",
    "notes": "CG124. Published June 2011; last updated Jan 2023 (surgical procedure recommendations); second pass reports a May 2023 amendment. Clinical basis of the NHFD and BPT.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Bone Health",
      "Older Adult"
    ],
    "priority": "high",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/cg124.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/cg124",
        "label": "Published 2011, updated 2023"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-hip-fracture-qs16",
    "section": "Trauma",
    "type": "National guidance",
    "topic": "Hip fracture in adults - quality standard",
    "subGroup": "Published 2012, updated Jan 2023",
    "source": "NICE",
    "summary": "Quality standard for diagnosing and managing hip fracture in adults. Statements cover multidisciplinary management, timing/expertise for surgery, trochanteric and subtrochanteric implant choice, and rehabilitation - patients should start rehabilitation at least once daily, no later than the day after surgery. Underpins NHFD best-practice metrics.",
    "notes": "QS16. Published March 2012; last updated Jan 2023 (statement 3 removed, statement 4 reworded). Endorsed by NHS England.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Bone Health",
      "Service & Commissioning"
    ],
    "priority": "high",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/qs16.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/qs16",
        "label": "Published 2012, updated Jan 2023"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-lower-limb-lengthening-htg613",
    "section": "Trauma",
    "type": "National guidance",
    "topic": "Intramedullary distraction for lower limb lengthening",
    "subGroup": "Published March 2022",
    "source": "NICE",
    "summary": "Inserting an internal magnetic intramedullary lengthening device to gradually lengthen a short leg (femur/tibia) for congenital discrepancy or post-trauma. Patient benefits over external fixators, but restricted to specialist centres.",
    "notes": "HTG613 (migrated from IPG718, replacing IPG197). Published March 2022.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Paediatrics",
      "Limb Reconstruction"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg613.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg613",
        "label": "Published March 2022"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-upper-limb-lengthening-htg621",
    "section": "Trauma",
    "type": "National guidance",
    "topic": "Intramedullary distraction for upper limb lengthening",
    "subGroup": "Published April 2022",
    "source": "NICE",
    "summary": "Inserting an internal magnetic intramedullary lengthening device (e.g. PRECICE) to gradually lengthen a short arm, in children, young people and adults. Restricted to specialist paediatric/limb reconstruction units under standard governance.",
    "notes": "HTG621 (migrated from IPG722). Published April 2022.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Paediatrics",
      "Limb Reconstruction"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg621.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg621",
        "label": "Published April 2022"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-lipus-delayed-nonunion-htg481",
    "section": "Trauma",
    "type": "National guidance",
    "topic": "LIPUS - delayed-union & non-union fractures",
    "subGroup": "Published July 2018",
    "source": "NICE",
    "summary": "Low-intensity pulsed ultrasound applied over a delayed-union or non-union fracture. Evidence on safety and efficacy adequate to support use as a non-surgical intervention.",
    "notes": "HTG481 (migrated from IPG623). Published July 2018. Part of the LIPUS trio replacing IPG374.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Infection & Tumour",
      "Limb Reconstruction"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg481.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg481",
        "label": "Published July 2018"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-lipus-fresh-high-risk-htg480",
    "section": "Trauma",
    "type": "National guidance",
    "topic": "LIPUS - fresh fractures, high risk of non-healing",
    "subGroup": "Published July 2018",
    "source": "NICE",
    "summary": "Low-intensity pulsed ultrasound applied over a fresh fracture at high clinical risk of delayed union or non-union. Evidence adequate to support use under standard clinical governance.",
    "notes": "HTG480 (migrated from IPG622). Published July 2018. Part of the LIPUS trio replacing IPG374.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Rehabilitation"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg480.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg480",
        "label": "Published July 2018"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-lipus-fresh-low-risk-htg479",
    "section": "Trauma",
    "type": "National guidance",
    "topic": "LIPUS - fresh fractures, low risk of non-healing",
    "subGroup": "Published July 2018",
    "source": "NICE",
    "summary": "Low-intensity pulsed ultrasound applied over a fresh fracture at low risk of non-healing. Evidence inadequate to support routine use for fresh fractures expected to heal normally.",
    "notes": "HTG479 (migrated from IPG621). Published July 2018. Part of the LIPUS trio (HTG479/480/481) replacing IPG374.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Rehabilitation"
    ],
    "priority": "low",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/htg479.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/htg479",
        "label": "Published July 2018"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "mobilisation-weightbearing",
    "section": "Trauma",
    "type": "Specialist society guidance",
    "topic": "Mobilisation & weight-bearing after orthopaedic surgery / injury",
    "subGroup": "August 2024",
    "source": "BOA (BOASt)",
    "summary": "Default to early mobilisation and weight-bearing unless a specific contraindication is documented, to reduce complications of immobility. Provides an agreed lexicon with precise definitions for weight-bearing instructions usable by all care providers. Clear weight-bearing instructions should be recorded for every operative/injured patient.",
    "notes": "August 2024. Pair with the NHFD weight-bearing briefing and BOFAS weight-bearing guidance.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Elective",
      "Rehabilitation"
    ],
    "priority": "medium",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "200 response, non-colliding GUID; Aug 2024 confirmed by second pass.",
    "versions": [
      {
        "url": "https://www.boa.ac.uk/asset/C735F86B-6172-43EF-AA90005C8E3F0706/",
        "label": "August 2024"
      },
      {
        "url": "https://www.boa.ac.uk/standards-guidance/boasts.html",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nhfd-annual-report-appendices-2025",
    "section": "Trauma",
    "type": "National guidance",
    "topic": "NHFD 2025 supplementary appendices",
    "subGroup": "2025",
    "source": "NHFD (RCP / FFFAP)",
    "summary": "Supplementary analytical documents published alongside the 2025 annual report - trust-level data tables and SPC charts covering 30-day mortality outliers, non-weight-bearing rates, non-operative management rates, bone medication, average hours to ward, pressure sore monitoring, KPIs for femoral shaft / distal shaft / periprosthetic (PPFF) fractures, and the leads and governance survey.",
    "notes": "All 2024 data unless stated. For departmental audit and benchmarking rather than bedside reference.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Bone Health",
      "Local Overlay"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "All URLs listed directly on the NHFD 2025 report page.",
    "versions": [
      {
        "url": "https://www.nhfd.co.uk/reportopen/Outliers+for+30-day+mortality+in+2024",
        "label": "2025"
      },
      {
        "url": "https://www.fffap.org.uk/",
        "label": "Fallback / index page"
      },
      {
        "url": "https://www.nhfd.co.uk/reportopen/Non-weight+bearing+rates+2024",
        "label": "Non-weight bearing"
      },
      {
        "url": "https://www.nhfd.co.uk/reportopen/Non-operative+management+rates+2024",
        "label": "Non-operative mgmt"
      },
      {
        "url": "https://www.nhfd.co.uk/reportopen/Bone+medication+2024",
        "label": "Bone medication"
      },
      {
        "url": "https://www.nhfd.co.uk/reportopen/Average+hours+to+ward+2024",
        "label": "Hours to ward"
      },
      {
        "url": "https://www.nhfd.co.uk/reportopen/Pressure+sore+monitoring+2024",
        "label": "Pressure sores"
      },
      {
        "url": "https://www.nhfd.co.uk/reportopen/KPIs+for+femoral+shaft+fractures+2024",
        "label": "Femoral shaft KPIs"
      },
      {
        "url": "https://www.nhfd.co.uk/reportopen/KPIs+for+distal+shaft+fractures+2024",
        "label": "Distal shaft KPIs"
      },
      {
        "url": "https://www.nhfd.co.uk/reportopen/KPIs+for+PPFF+fractures+2024",
        "label": "PPFF KPIs"
      },
      {
        "url": "https://www.nhfd.co.uk/reportopen/Leads+and+governance+survey+2025",
        "label": "Leads & governance survey"
      }
    ]
  },
  {
    "id": "nhfd-annual-report-2025",
    "section": "Trauma",
    "type": "National guidance",
    "topic": "NHFD Annual Report - 'Room for improvement: hip fracture care in 2024'",
    "subGroup": "September 2025",
    "source": "NHFD (RCP / FFFAP)",
    "summary": "The 2025 report on 2024 data. Patients waited an average of 15 hours before being settled on an appropriate ward; 5% of operations were performed by unsupervised trainees; nine hospitals recorded over 10% of patients not allowed to fully weight-bear post-op; 58% now receive bone-strengthening medication but 10 hospitals discharged over three-quarters of patients without effective bone protection. Five recommendations to ICBs by April 2026 - fast-track admission (at least 1 in 5 to orthopaedic ward within 4 hours), 95%+ access to senior-supervised surgery allowing full weight-bearing, weekend physiotherapy capacity, review of injectable bone protection, and use of the new pelvic ring fracture audit.",
    "notes": "Published 11 September 2025; launch webinar 6 Nov 2025. Directly relevant to the NOF governance project.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Bone Health",
      "Local Overlay",
      "Older Adult"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified - findings and recommendations read directly from the NHFD 2025 report page.",
    "versions": [
      {
        "url": "https://www.nhfd.co.uk/reportopen/NHFD+2025+Annual+Report",
        "label": "September 2025"
      },
      {
        "url": "https://www.fffap.org.uk/",
        "label": "Fallback / index page"
      },
      {
        "url": "https://www.nhfd.co.uk/reportopen/NHFD+Lay+Summary+Report+2025",
        "label": "Lay Summary 2025"
      },
      {
        "url": "https://www.nhfd.co.uk/2024report",
        "label": "2024 report"
      },
      {
        "url": "https://www.nhfd.co.uk/2023report",
        "label": "2023 report"
      },
      {
        "url": "https://nhfd.co.uk/20/hipfractureR.nsf/docs/2025Report",
        "label": "All years index"
      }
    ]
  },
  {
    "id": "nhfd-kpis",
    "section": "Trauma",
    "type": "National guidance",
    "topic": "NHFD Key Performance Indicators (KPI 0-7)",
    "subGroup": "Live, rolling",
    "source": "NHFD (RCP / FFFAP)",
    "summary": "The eight headline hip fracture KPIs, reported on an annualised rolling basis for every hospital. KPI 0 - admission to specialist orthopaedic ward within 4 hours. KPI 1 - orthogeriatric review within 72 hours. KPI 2 - surgery on day of or day after admission. KPI 3 - NICE-compliant surgery. KPI 4 - mobilised out of bed by the day after surgery. KPI 5 - not delirious post-operatively (4AT). KPI 6 - return to original residence by 120 days. KPI 7 - bone medication at 120 days. Plus 30-day mortality (crude and risk-adjusted).",
    "notes": "Open-access, no login. Filterable to any individual hospital. The live operational view most useful to a department. Directly tied to NHS financial incentives via BPT.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Bone Health",
      "Local Overlay",
      "Service & Commissioning"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URL confirmed on the NHFD homepage navigation.",
    "versions": [
      {
        "url": "https://www.nhfd.co.uk/Charts/KPIsOverview",
        "label": "Live, rolling"
      },
      {
        "url": "https://www.fffap.org.uk/",
        "label": "Fallback / index page"
      },
      {
        "url": "https://www.nhfd.co.uk/Charts",
        "label": "Performance charts"
      },
      {
        "url": "https://nhfd.co.uk/20/NHFDcharts.nsf/fmBenchmarks?readform",
        "label": "Online benchmarks"
      },
      {
        "url": "https://nhfd.co.uk/20/NHFDcharts.nsf/fmDashboard?readform",
        "label": "Dashboards and ratings"
      }
    ]
  },
  {
    "id": "nhfd-resource-repository",
    "section": "Trauma",
    "type": "National guidance",
    "topic": "NHFD resource repository (clinician & patient resources)",
    "subGroup": "Current",
    "source": "RCP (FFFAP)",
    "summary": "RCP-hosted repository of NHFD resources including guidance for ED staff on prioritising hip fracture care, key topics an orthogeriatrician should cover at initial assessment, how physiotherapists can use NHFD data, and the Orthopaedic Out of Bed Project (OOBP). Also holds patient and carer guides covering surgery, anaesthesia options and post-discharge rehabilitation.",
    "notes": "Complements the Improvement Repository. Short, practical clinician-facing material rather than formal guidance.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Local Overlay",
      "Rehabilitation"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "RE-CONFIRMED 29/07/2026: live and correct. Genuinely a mixed repository of short videos/webinars/case studies rather than formal guidance, exactly as the existing Notes already say - correctly an index-style entry by design, not a hub-vs-guideline problem.",
    "versions": [
      {
        "url": "https://www.rcp.ac.uk/improving-care/resources/nhfd-resource-repository/",
        "label": "Current"
      },
      {
        "url": "https://www.fffap.org.uk/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "girft-non-ambulatory-fragility-fracture",
    "section": "Trauma",
    "type": "National guidance",
    "topic": "Non-ambulatory fragility fracture (NAFF) pathway",
    "subGroup": "May 2024",
    "source": "GIRFT (NHS England)",
    "summary": "Pathway for fragility fracture patients who cannot mobilise but fall outside the hip-fracture cohort (pubic rami, pelvic, humeral). Addresses the central GIRFT equity argument: these patients have the same needs as hip fracture patients but lack the BPT, NHFD monitoring and orthogeriatric input the hip cohort receives. Recommends BPT-equivalent standards apply to all NAFF patients, with rapid analgesia and excellent palliative/end-of-life orthopaedic care.",
    "notes": "FINAL V4, May 2024. Highly relevant to the parallel NOF governance project.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Bone Health",
      "Emergencies",
      "Older Adult"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "CONFIRMED 29/07/2026: this exact .drawio.html URL is live and listed on the official GIRFT pathways index (gettingitrightfirsttime.co.uk/academy-resources/pathways/, fetched directly). Format is confirmed correct, just not machine-readable as plain text - it opens correctly in a browser.",
    "versions": [
      {
        "url": "https://gettingitrightfirsttime.co.uk/wp-content/uploads/2024/05/Non-Ambulatory-Fragility-Fracture-pathway-FINAL-V4-May-2024.html",
        "label": "May 2024"
      },
      {
        "url": "https://gettingitrightfirsttime.co.uk/academy-resources/pathways/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nice-noncomplex-fractures-ng38",
    "section": "Trauma",
    "type": "National guidance",
    "topic": "Non-complex fractures - assessment and management",
    "subGroup": "Published 2016, reviewed June 2025",
    "source": "NICE",
    "summary": "Non-complex fractures treatable in the emergency department or orthopaedic clinic. Covers initial pain management and immobilisation, imaging, ED management, ongoing orthopaedic care and non-accidental injury. Supports conservative options (e.g. splints for paediatric torus/buckle fractures) and avoiding unnecessary tests and prolonged casting.",
    "notes": "NG38. Published Feb 2016; last reviewed June 2025. High relevance to Virtual Fracture Clinics and paediatric NAI red flags.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Emergencies",
      "Paediatrics"
    ],
    "priority": "high",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified in pass 1 (title/reference number confirmed) and re-confirmed live in pass 2. Canonical nice.org.uk/guidance/ng38.",
    "versions": [
      {
        "url": "https://www.nice.org.uk/guidance/ng38",
        "label": "Published 2016, reviewed June 2025"
      },
      {
        "url": "https://www.nice.org.uk/guidance/conditions-and-diseases/musculoskeletal-conditions",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "open-fractures",
    "section": "Trauma",
    "type": "Specialist society guidance",
    "topic": "Open fractures (BOASt 4)",
    "subGroup": "December 2017",
    "source": "BOA (BOASt)",
    "summary": "Photograph the wound, remove gross contamination, apply saline-soaked dressing and splint; give IV antibiotics within 1 hour of injury and tetanus prophylaxis. Combined ortho-plastics management with concurrent consultant planning; definitive soft tissue cover within 72 hours. Use Gustilo-Anderson classification after debridement, not in ED.",
    "notes": "December 2017. One of the most-used on-call standards.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Emergencies",
      "Infection & Tumour"
    ],
    "priority": "high",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "Content-verified against fetched PDF.",
    "versions": [
      {
        "url": "https://www.boa.ac.uk/asset/3B91AD0A%2D9081%2D4253%2D92F7D90E8DF0FB2C/",
        "label": "December 2017"
      },
      {
        "url": "https://www.boa.ac.uk/standards-guidance/boasts.html",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "ots-orthopaedic-trauma-society",
    "section": "Trauma",
    "type": "Specialist society guidance",
    "topic": "Orthopaedic Trauma Society - standards & policy",
    "subGroup": "Current",
    "source": "OTS",
    "summary": "The official body representing trauma orthopaedics in the UK, recognised by the BOA, NICE, NHS England and the International Orthopaedic Trauma Association (founded 2011). OTS acts as a formal NICE stakeholder. Its constitution states the Policy Committee 'oversees policy and communications activities, including national guidelines, and BOASTs' - meaning OTS contributes to trauma guidance THROUGH BOASts and NICE rather than publishing independent standards.",
    "notes": "NO INDEPENDENT OTS GUIDELINES FOUND. The OTS website returns HTTP 401 to automated access - MANUAL BROWSER CHECK REQUIRED before publishing any OTS link.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Emergencies",
      "Service & Commissioning"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "RE-CONFIRMED 29/07/2026: orthopaedictrauma.org.uk (including /policy/) still returns HTTP 401 to automated fetch tools. The site is genuinely live with real content (visible via search-index cache: About, Policy, Resources pages all exist) - this is an automated-access block on the OTS server, not a dead site. Still no evidence of independent OTS clinical guidelines, only policy/representation content.",
    "versions": [
      {
        "url": "https://orthopaedictrauma.org.uk/",
        "label": "Current"
      },
      {
        "url": "https://www.boa.ac.uk/policy-engagement/specialist-societies/orthopaedic-trauma-society-ots.html",
        "label": "Fallback / index page"
      },
      {
        "url": "https://orthopaedictrauma.org.uk/policy/",
        "label": "OTS policy page"
      }
    ]
  },
  {
    "id": "outpatient-oncall-fracture-services",
    "section": "Trauma",
    "type": "Specialist society guidance",
    "topic": "Outpatient & on-call services for fractures / MSK injury",
    "subGroup": "February 2026",
    "source": "BOA (BOASt)",
    "summary": "Sets standards for virtual and traditional fracture clinic pathways and on-call services, ensuring timely senior review and safe discharge of non-complex injuries. Describes the key steps in organising care for MSK injury that does not need immediate admission. Underpins complex vs non-complex fracture triage.",
    "notes": "February 2026 - supersedes archived 'Fracture clinic services'.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Local Overlay",
      "Service & Commissioning"
    ],
    "priority": "medium",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "200 response, non-colliding GUID; Feb 2026 currency confirmed by second pass.",
    "versions": [
      {
        "url": "https://www.boa.ac.uk/asset/513423FF-1257-4C15-958A92BB5BE11877/",
        "label": "February 2026"
      },
      {
        "url": "https://www.boa.ac.uk/standards-guidance/boasts.html",
        "label": "Fallback / index page"
      },
      {
        "url": "https://www.boa.ac.uk/asset/7DED8F00-987E-42D5-A389E739B1E03B47/",
        "label": "Archived (Fracture clinic services)"
      }
    ]
  },
  {
    "id": "peripheral-nerve-injury",
    "section": "Trauma",
    "type": "Specialist society guidance",
    "topic": "Peripheral nerve injury",
    "subGroup": "December 2021",
    "source": "BOA (BOASt)",
    "summary": "Document a careful motor/sensory exam in every limb injury; distinguish neurapraxia from transection and refer early where a lesion is suspected. Open injuries with nerve deficit warrant urgent exploration; closed injuries need timely specialist assessment to plan repair/grafting. Pathways for early identification and timely management are key to outcome.",
    "notes": "December 2021.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Hand & Wrist",
      "Emergencies"
    ],
    "priority": "medium",
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "200 response, non-colliding GUID. Content-check pending.",
    "versions": [
      {
        "url": "https://www.boa.ac.uk/asset/3F12946D%2D0407%2D4A6D%2D875DB3C6A9C265EB/",
        "label": "December 2021"
      },
      {
        "url": "https://www.boa.ac.uk/standards-guidance/boasts.html",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "bhs-periprosthetic-fracture",
    "section": "Trauma",
    "type": "Specialist society guidance",
    "topic": "Periprosthetic fracture around a hip replacement",
    "subGroup": "2021/2022",
    "source": "British Hip Society / BOA",
    "summary": "BHS Surgical Standard (co-badged as a BOAST) on revision for periprosthetic fracture around a hip replacement - a common and rising presentation in the frail elderly, sitting at the junction of trauma and arthroplasty. Vancouver classification. Requires arthroplasty-trained surgeon involvement and revision network input.",
    "notes": "2021/2022. CLOSES THE PERIPROSTHETIC FRACTURE GAP - this was on the original checklist as 'check coverage' with no source identified. Complements the NHFD PPFF KPIs in the 2025 annual report.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-28",
    "crossListedIn": [
      "Hip",
      "Elective",
      "Emergencies"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "URL listed on the current BHS official Revision Hip Network page.",
    "versions": [
      {
        "url": "https://britishhipsociety.com/Portals/0/Downloads/Revision-Hip-Network/BHSSS-Periprosthetic.pdf",
        "label": "2021/2022"
      },
      {
        "url": "https://britishhipsociety.com/resources/",
        "label": "Fallback / index page"
      }
    ]
  },
  {
    "id": "nhfd-weightbearing-guidance",
    "section": "Trauma",
    "type": "National guidance",
    "topic": "Weight-bearing after hip fracture surgery - NHFD briefing",
    "subGroup": "August 2024",
    "source": "NHFD (RCP / FFFAP)",
    "summary": "Unrestricted weight-bearing should be the default after surgery for fragility hip fracture (THR, hemiarthroplasty, IM nail, DHS). The 2025 annual report flags communication around weight-bearing permissions as a key improvement area, noting nine hospitals recorded over 10% of patients not allowed to fully weight-bear.",
    "notes": "August 2024. Hosted on the NHFD Guidelines and pathways resource page. Complements BOASt 'Mobilisation and weightbearing after orthopaedic surgery'.",
    "status": "Live",
    "regionalVariation": false,
    "localOverlayNeeded": false,
    "lastChecked": "2026-07-29",
    "crossListedIn": [
      "Emergencies",
      "Local Overlay",
      "Rehabilitation"
    ],
    "linkVerificationStatus": "verified",
    "linkLastVerified": "2026-08-06",
    "linkVerificationNotes": "PARTIALLY CONFIRMED 29/07/2026: the document is listed live on the NHFD Guidelines and pathways page (thumbnail + title 'Weightbearing guidance', dated Aug 2024). However, TWO independent automated fetch attempts at the deep link returned 'Error - Not found!' - this could be a genuinely removed file, or a Lotus Notes session/referrer quirk (the same platform issue the original audit already flagged). Cannot be fully resolved without a manual browser click-through.",
    "versions": [
      {
        "url": "https://nhfd.co.uk/FFFAP/Resources.nsf/pages/NHFD+Guidelines+and+pathways",
        "label": "August 2024"
      },
      {
        "url": "https://www.fffap.org.uk/",
        "label": "Fallback / index page"
      },
      {
        "url": "https://www.nhfd.co.uk/FFFAP/Resources.nsf/doc?open&NHFD_Weightbearing_Briefing_202408.pdf",
        "label": "Attempted direct deep link (returns 'Error - Not found!' on automated fetch, but renders as a live thumbnail titled 'Weightbearing guidance' on the parent page)"
      }
    ]
  }
];
