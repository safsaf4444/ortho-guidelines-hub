/**
 * src/lib/search/terminology.ts
 * ─────────────────────────────
 * A small, reviewable clinical-terminology dictionary for query expansion.
 *
 * RULES FOR ADDING AN ENTRY (read before editing):
 *   1. `synonyms` are names for THE SAME thing in UK orthopaedic usage —
 *      an abbreviation and its expansion, a lay name and the clinical name,
 *      a British and an American term. A query for one should find a title
 *      that uses another.
 *   2. `related` are DIFFERENT things a clinician searching for the entry
 *      may also want to see (a subtype, a programme name, an older term).
 *      They are matched at half weight and never counted as the same
 *      concept. When in doubt, put it here, not in `synonyms`.
 *   3. Two different conditions are never synonyms. "Hip dysplasia" (adult)
 *      and "DDH" (developmental) are related, not the same.
 *   4. Every entry records where the terms are seen: a catalogue entry id
 *      whose title or summary uses the form (so the mapping is anchored to
 *      the data this engine searches), or "usage" where the pairing is
 *      standard clinical usage but no catalogue text contains both forms.
 *   5. Abbreviations that are ambiguous outside orthopaedics (PE, CT, ED,
 *      ACS, ASD) are deliberately absent.
 *
 * This file is data. Nothing in it decides relevance; the engine reads it.
 */

export interface TermEntry {
  /** Stable key, for tests and explanations. */
  id: string;
  /** Names for the same concept. Matched at full weight. */
  synonyms: readonly string[];
  /** Different but adjacent concepts. Matched at half weight. */
  related?: readonly string[];
  /**
   * Evidence: catalogue entry ids whose text uses these forms, or "usage"
   * for standard clinical usage with no catalogue co-occurrence.
   */
  evidence: readonly string[];
}

export const TERMINOLOGY: readonly TermEntry[] = [
  // ── Arthroplasty ──────────────────────────────────────────────────────────
  {
    id: 'thr',
    synonyms: ['THR', 'THA', 'total hip replacement', 'total hip arthroplasty', 'hip replacement', 'hip arthroplasty'],
    related: ['hip resurfacing', 'primary joint replacement'],
    evidence: ['nice-mis-thr-htg236', 'nice-supercapsular-tha-htg626', 'nice-thr-resurfacing-ta304', 'bhs-girft-hip-arthroplasty-op-record'],
  },
  {
    id: 'tkr',
    synonyms: ['TKR', 'TKA', 'total knee replacement', 'total knee arthroplasty', 'knee replacement', 'knee arthroplasty'],
    related: ['primary joint replacement', 'revision knee'],
    evidence: ['nice-mini-incision-tkr-htg220', 'nice-aposhealth-knee-htg671', 'nice-joint-replacement-qs206'],
  },
  {
    id: 'tar',
    synonyms: ['TAR', 'total ankle replacement', 'total ankle arthroplasty', 'ankle replacement', 'ankle arthroplasty'],
    evidence: ['bofas-total-ankle-replacement-statement', 'end-stage-ankle-arthritis'],
  },
  {
    id: 'ter',
    synonyms: ['TER', 'TEA', 'total elbow replacement', 'total elbow arthroplasty', 'elbow replacement', 'elbow arthroplasty'],
    evidence: ['girft-elective-total-elbow-replacement', 'bess-elbow-replacement-spg', 'girft-trauma-total-elbow-replacement'],
  },
  {
    id: 'joint-replacement',
    synonyms: ['joint replacement', 'arthroplasty', 'joint arthroplasty'],
    evidence: ['nice-joint-replacement-ng157', 'nice-joint-replacement-qs206'],
  },
  {
    id: 'pji',
    synonyms: ['PJI', 'periprosthetic joint infection', 'peri-prosthetic joint infection', 'prosthetic joint infection', 'infected joint replacement'],
    related: ['FRI', 'bone and joint infection'],
    evidence: ['acute-periprosthetic-joint-infection', 'periprosthetic-joint-infection-specs', 'bhs-periprosthetic-joint-infection', 'bess-pji-shoulder-elbow'],
  },
  {
    id: 'periprosthetic-fracture',
    synonyms: ['periprosthetic fracture', 'peri-prosthetic fracture', 'PPFF', 'periprosthetic femoral fracture'],
    evidence: ['bhs-periprosthetic-fracture', 'nhfd-annual-report-appendices-2025'],
  },
  // ── Knee ──────────────────────────────────────────────────────────────────
  {
    id: 'acl',
    synonyms: ['ACL', 'anterior cruciate ligament', 'anterior cruciate'],
    related: ['ACL reconstruction', 'knee ligament injury'],
    evidence: ['acl-injury-management', 'acl-skeletally-immature', 'bostaa-acl-postop-protocols'],
  },
  {
    id: 'meniscal-tear',
    synonyms: ['meniscal tear', 'meniscus tear', 'torn meniscus', 'meniscal injury', 'meniscal injuries'],
    related: ['knee arthroscopy'],
    evidence: ['ebi-arthroscopic-surgery-meniscal-tears', 'bask-meniscal-surgery-guidelines', 'ebi-knee-mri-suspected-meniscal-tears'],
  },
  {
    id: 'patellar-dislocation',
    synonyms: ['patellar dislocation', 'patella dislocation', 'kneecap dislocation', 'dislocated patella'],
    related: ['patellar instability', 'trochleoplasty'],
    evidence: ['first-time-lateral-patellar-dislocation', 'nice-trochleoplasty-htg328'],
  },
  {
    id: 'aci',
    synonyms: ['ACI', 'autologous chondrocyte implantation'],
    related: ['cartilage defect', 'chondral defect'],
    evidence: ['nice-aci-ta477', 'nice-aci-chondrosphere-ta508'],
  },
  {
    id: 'prp',
    synonyms: ['PRP', 'platelet rich plasma', 'platelet-rich plasma'],
    evidence: ['nice-prp-knee-htg497'],
  },
  // ── Hip ───────────────────────────────────────────────────────────────────
  {
    id: 'nof',
    synonyms: ['NOF', 'hip fracture', 'neck of femur', 'neck of femur fracture', 'fractured neck of femur', 'femoral neck fracture', 'proximal femoral fracture', 'broken hip'],
    related: ['fragility fracture', 'NHFD', 'National Hip Fracture Database'],
    evidence: ['nice-hip-fracture-cg124', 'nhfd-exemplar-local-pathways', 'nice-hip-fracture-qs16'],
  },
  {
    id: 'fai',
    synonyms: ['FAI', 'femoroacetabular impingement', 'femoro-acetabular impingement', 'hip impingement'],
    evidence: ['bhs-fai-standard', 'nice-open-fai-htg270', 'nice-arthroscopic-fai-htg273'],
  },
  {
    id: 'gtps',
    synonyms: ['GTPS', 'greater trochanteric pain syndrome'],
    related: ['trochanteric bursitis', 'lateral hip pain'],
    evidence: ['nice-itb-lengthening-gtps-htg246', 'nice-ecswt-gtps-htg248'],
  },
  {
    id: 'ddh',
    synonyms: ['DDH', 'developmental dysplasia of the hip', 'developmental hip dysplasia'],
    related: ['hip dysplasia', 'adult hip dysplasia'],
    evidence: ['bscos-ddh-consensus', 'bhs-adult-hip-dysplasia'],
  },
  {
    id: 'scfe',
    synonyms: ['SCFE', 'SUFE', 'slipped capital femoral epiphysis', 'slipped upper femoral epiphysis'],
    evidence: ['nice-scfe-open-reduction-htg365'],
  },
  // ── Hand and wrist ────────────────────────────────────────────────────────
  {
    id: 'cts',
    synonyms: ['CTS', 'carpal tunnel syndrome', 'carpal tunnel'],
    related: ['carpal tunnel release', 'carpal tunnel decompression'],
    evidence: ['girft-carpal-tunnel', 'ebi-carpal-tunnel-syndrome-release'],
  },
  {
    id: 'trigger-finger',
    synonyms: ['trigger finger', 'trigger digit', 'trigger thumb', 'stenosing tenosynovitis'],
    evidence: ['girft-trigger-digit', 'ebi-trigger-finger-release'],
  },
  {
    id: 'dupuytren',
    synonyms: ['Dupuytren', "Dupuytren's", 'Dupuytrens', "Dupuytren's contracture", "Dupuytren's disease", 'Dupuytren contracture'],
    evidence: ['girft-dupuytrens', 'ebi-dupuytrens-contracture-release'],
  },
  {
    id: 'ganglion',
    synonyms: ['ganglion', 'ganglion cyst', 'wrist ganglion'],
    evidence: ['girft-wrist-ganglion', 'ebi-ganglion-excision'],
  },
  {
    id: 'distal-radius-fracture',
    synonyms: ['distal radius fracture', 'distal radial fracture', 'DRF', 'fractured distal radius'],
    related: ['wrist fracture', 'Colles fracture'],
    evidence: ['distal-radius-fracture', 'bssh-distal-radial-fractures'],
  },
  {
    id: 'druj',
    synonyms: ['DRUJ', 'distal radioulnar joint', 'distal radio-ulnar joint'],
    evidence: ['nice-druj-replacement-htg451'],
  },
  {
    id: 'crps',
    synonyms: ['CRPS', 'complex regional pain syndrome'],
    evidence: ['bssh-crps-guidelines'],
  },
  {
    id: 'walant',
    synonyms: ['WALANT', 'wide awake local anaesthetic no tourniquet', 'wide awake hand surgery'],
    related: ['local anaesthetic', 'regional anaesthesia'],
    evidence: ['bssh-walant-anaesthesia'],
  },
  {
    id: 'mcp',
    synonyms: ['MCP', 'MCPJ', 'metacarpophalangeal', 'metacarpophalangeal joint'],
    evidence: ['nice-mcp-ip-replacement-htg66'],
  },
  // ── Foot and ankle ────────────────────────────────────────────────────────
  {
    id: 'hallux-valgus',
    synonyms: ['hallux valgus', 'bunion', 'bunions'],
    evidence: ['girft-bunions', 'bofas-hallux-valgus'],
  },
  {
    id: 'mtp',
    synonyms: ['MTP', 'MTPJ', 'metatarsophalangeal', 'metatarsophalangeal joint'],
    evidence: ['nice-hallux-mtp-replacement-htg87'],
  },
  {
    id: 'achilles-rupture',
    synonyms: ['Achilles tendon rupture', 'Achilles rupture', 'ruptured Achilles', 'tendo Achilles rupture'],
    evidence: ['bofas-achilles-acute-rupture'],
  },
  {
    id: 'diabetic-foot',
    synonyms: ['diabetic foot', 'diabetic foot disease', 'diabetic foot ulcer'],
    related: ['Charcot', 'Charcot foot', 'Charcot neuroarthropathy'],
    evidence: ['bofas-diabetic-foot-charcot', 'bofas-diabetic-foot-guidelines'],
  },
  {
    id: 'flatfoot',
    synonyms: ['flatfoot', 'flat foot', 'flat feet', 'pes planus'],
    evidence: ['bofas-flatfoot-commissioning', 'bscos-flexible-flatfoot-consensus'],
  },
  {
    id: 'clubfoot',
    synonyms: ['clubfoot', 'club foot', 'CTEV', 'talipes', 'talipes equinovarus'],
    evidence: ['bscos-patient-information'],
  },
  // ── Spine ─────────────────────────────────────────────────────────────────
  {
    id: 'ces',
    synonyms: ['CES', 'cauda equina syndrome', 'cauda equina'],
    evidence: ['bass-cauda-equina-standards', 'girft-cauda-equina-pathway'],
  },
  {
    id: 'mscc',
    synonyms: ['MSCC', 'metastatic spinal cord compression', 'spinal cord compression'],
    related: ['spinal metastases'],
    evidence: ['nice-spinal-metastases-mscc-ng234'],
  },
  {
    id: 'sci',
    synonyms: ['SCI', 'spinal cord injury', 'traumatic spinal cord injury'],
    evidence: ['traumatic-spinal-cord-injury'],
  },
  {
    id: 'low-back-pain',
    synonyms: ['low back pain', 'lower back pain', 'LBP', 'lumbar back pain'],
    related: ['sciatica', 'back pain'],
    evidence: ['nice-low-back-pain-ng59', 'ebi-injections-isolated-low-back-pain'],
  },
  {
    id: 'acdf',
    synonyms: ['ACDF', 'anterior cervical discectomy and fusion', 'anterior cervical discectomy'],
    related: ['cervical disc replacement'],
    evidence: ['girft-acdf-disc-replacement'],
  },
  {
    id: 'posterior-lumbar-fusion',
    synonyms: ['posterior lumbar fusion', 'PLF', 'TLIF', 'PLIF', 'lumbar fusion', 'spinal fusion', 'fusion surgery'],
    evidence: ['girft-posterior-fusion', 'ebi-fusion-surgery-axial-low-back-pain'],
  },
  {
    id: 'si-joint',
    synonyms: ['SI joint', 'SIJ', 'sacroiliac joint', 'sacroiliac'],
    evidence: ['nice-ifuse-si-joint-htg488', 'nice-si-joint-fusion-htg436'],
  },
  {
    id: 'vcf',
    synonyms: ['VCF', 'vertebral compression fracture', 'vertebral compression fractures'],
    related: ['vertebral fragility fracture', 'VFF', 'vertebral augmentation', 'kyphoplasty', 'vertebroplasty'],
    evidence: ['nice-craniocaudal-implant-vcf-htg422', 'nice-balloon-kyphoplasty-htg108', 'nice-vertebroplasty-kyphoplasty-ta279'],
  },
  {
    id: 'vff',
    synonyms: ['VFF', 'vertebral fragility fracture', 'osteoporotic vertebral fracture'],
    related: ['vertebral compression fracture', 'VCF'],
    evidence: ['girft-vertebral-fragility-fracture', 'nice-ai-vertebral-fracture-htg760', 'ros-vertebral-fracture-identification'],
  },
  {
    id: 'vertebral-augmentation',
    synonyms: ['vertebral augmentation'],
    related: ['kyphoplasty', 'balloon kyphoplasty', 'vertebroplasty'],
    evidence: ['ebi-vertebral-augmentation-osteoporotic-fractures', 'nice-vertebroplasty-kyphoplasty-ta279'],
  },
  {
    id: 'facet-joint-injection',
    synonyms: ['facet joint injection', 'medial branch block'],
    related: ['radiofrequency denervation', 'facet denervation'],
    evidence: ['girft-lumbar-facet-joint-injection', 'ebi-lumbar-radiofrequency-facet-denervation'],
  },
  {
    id: 'nerve-root-block',
    synonyms: ['nerve root block', 'lumbar nerve root block', 'transforaminal epidural'],
    related: ['epidural'],
    evidence: ['girft-lumbar-nerve-root-block'],
  },
  {
    id: 'ais',
    synonyms: ['AIS', 'adolescent idiopathic scoliosis'],
    related: ['scoliosis'],
    evidence: ['bss-ais-sports-consensus'],
  },
  // ── Trauma ────────────────────────────────────────────────────────────────
  {
    id: 'open-fracture',
    synonyms: ['open fracture', 'open fractures', 'compound fracture'],
    evidence: ['open-fractures', 'nice-complex-fractures-ng37'],
  },
  {
    id: 'non-union',
    synonyms: ['non-union', 'nonunion', 'non union', 'fracture non-union'],
    related: ['delayed union', 'LIPUS'],
    evidence: ['nice-lipus-delayed-nonunion-htg481', 'nice-exogen-htg296'],
  },
  {
    id: 'lipus',
    synonyms: ['LIPUS', 'low intensity pulsed ultrasound', 'low-intensity pulsed ultrasound'],
    related: ['EXOGEN', 'ultrasound bone healing'],
    evidence: ['nice-lipus-fresh-low-risk-htg479', 'nice-exogen-htg296'],
  },
  {
    id: 'compartment-syndrome',
    synonyms: ['compartment syndrome', 'acute compartment syndrome'],
    evidence: ['compartment-syndrome'],
  },
  {
    id: 'pelvic-fracture',
    synonyms: ['pelvic fracture', 'pelvis fracture', 'pelvic ring injury', 'fractured pelvis'],
    related: ['pelvic binder'],
    evidence: ['pelvic-fracture'],
  },
  {
    id: 'supracondylar',
    synonyms: ['supracondylar fracture', 'supracondylar humerus fracture', 'supracondylar humeral fracture'],
    related: ['paediatric elbow fracture'],
    evidence: ['paediatric-supracondylar-fracture'],
  },
  {
    id: 'major-trauma',
    synonyms: ['major trauma', 'polytrauma', 'multiply injured patient'],
    evidence: ['nice-complex-fractures-ng37'],
  },
  {
    id: 'vascular-injury',
    synonyms: ['vascular injury', 'arterial injury'],
    evidence: ['arterial-injury-msk-trauma'],
  },
  {
    id: 'weight-bearing',
    synonyms: ['weight-bearing', 'weightbearing', 'weight bearing'],
    related: ['mobilisation', 'rehabilitation'],
    evidence: ['mobilisation-weightbearing', 'bofas-weightbearing-foot-ankle', 'nhfd-weightbearing-guidance'],
  },
  {
    id: 'x-ray',
    synonyms: ['x-ray', 'xray', 'radiograph', 'radiographs', 'plain film', 'radiography'],
    evidence: ['nice-ai-fracture-detection-htg739'],
  },
  {
    id: 'older-adult',
    synonyms: ['older', 'elderly', 'frail', 'older adult', 'older people'],
    related: ['geriatric', 'orthogeriatric'],
    evidence: ['older-frail-trauma-patient', 'boa-bgs-blue-book'],
  },
  {
    id: 'paediatric',
    synonyms: ['paediatric', 'children', 'child', 'childhood'],
    related: ['adolescent', 'skeletally immature'],
    evidence: ['paediatric-msk-infection', 'paediatric-forearm-fracture', 'bscos-weightbearing-consensus'],
  },
  // ── Bone health ───────────────────────────────────────────────────────────
  {
    id: 'osteoporosis',
    synonyms: ['osteoporosis', 'osteoporotic'],
    related: ['bone health', 'fragility fracture', 'bone density'],
    evidence: ['nogg-osteoporosis-guideline', 'nice-osteoporosis-risk-cg146'],
  },
  {
    id: 'fragility-fracture',
    synonyms: ['fragility fracture', 'fragility fractures', 'osteoporotic fracture', 'low-energy fracture'],
    related: ['osteoporosis', 'FLS'],
    evidence: ['nice-denosumab-ta204', 'girft-non-ambulatory-fragility-fracture', 'boa-bgs-blue-book'],
  },
  {
    id: 'fls',
    synonyms: ['FLS', 'fracture liaison service', 'fracture liaison services'],
    evidence: ['fls-db', 'ros-fls-clinical-standards'],
  },
  {
    id: 'dxa',
    synonyms: ['DXA', 'DEXA', 'bone density scan', 'bone densitometry', 'dual-energy x-ray absorptiometry'],
    evidence: ['bostaa-dexa-position', 'nice-osteoporosis-risk-cg146'],
  },
  {
    id: 'frax',
    synonyms: ['FRAX', 'fracture risk assessment tool', 'fracture risk calculator'],
    evidence: ['frax-calculator', 'nogg-osteoporosis-guideline'],
  },
  // ── Infection and tumour ──────────────────────────────────────────────────
  {
    id: 'fri',
    synonyms: ['FRI', 'fracture related infection', 'fracture-related infection'],
    related: ['PJI', 'osteomyelitis'],
    evidence: ['fracture-related-infection'],
  },
  {
    id: 'septic-arthritis',
    synonyms: ['septic arthritis', 'native joint infection', 'joint sepsis'],
    related: ['osteomyelitis', 'bone and joint infection'],
    evidence: ['msk-soft-tissue-infection-nec-fasc', 'paediatric-msk-infection'],
  },
  {
    id: 'osteomyelitis',
    synonyms: ['osteomyelitis', 'bone infection', 'osteitis'],
    related: ['septic arthritis', 'bone and joint infection'],
    evidence: ['ebjis-peripheral-bone-infection-adults', 'bscos-msk-infection-consensus'],
  },
  {
    id: 'necrotising-fasciitis',
    synonyms: ['necrotising fasciitis', 'necrotizing fasciitis', 'nec fasc'],
    related: ['soft tissue infection'],
    evidence: ['msk-soft-tissue-infection-nec-fasc'],
  },
  {
    id: 'metastatic-bone-disease',
    synonyms: ['metastatic bone disease', 'MBD', 'bone metastases', 'bony metastases', 'bone metastasis'],
    related: ['pathological fracture', 'spinal metastases'],
    evidence: ['metastatic-bone-disease', 'boos-metastatic-bone-disease-policy'],
  },
  {
    id: 'sarcoma',
    synonyms: ['sarcoma', 'sarcomas'],
    related: ['bone tumour', 'soft tissue mass', 'soft tissue tumour'],
    evidence: ['bsg-bone-sarcoma-guidelines', 'bsg-soft-tissue-sarcoma-guidelines'],
  },
  // ── Shoulder and elbow ────────────────────────────────────────────────────
  {
    id: 'frozen-shoulder',
    synonyms: ['frozen shoulder', 'adhesive capsulitis'],
    evidence: ['bess-frozen-shoulder'],
  },
  {
    id: 'tennis-elbow',
    synonyms: ['tennis elbow', 'lateral epicondylitis', 'lateral epicondylalgia'],
    evidence: ['bess-tennis-elbow'],
  },
  {
    id: 'rotator-cuff',
    synonyms: ['rotator cuff', 'rotator cuff tear', 'cuff tear'],
    related: ['rotator cuff repair', 'subacromial pain'],
    evidence: ['girft-shoulder-arthroscopy-rotator-cuff', 'bess-subacromial-shoulder-pain'],
  },
  {
    id: 'subacromial-decompression',
    synonyms: ['subacromial decompression', 'arthroscopic subacromial decompression', 'SAD'],
    related: ['subacromial pain', 'shoulder impingement'],
    evidence: ['ebi-arthroscopic-shoulder-decompression-subacromial', 'girft-shoulder-arthroscopy-rotator-cuff'],
  },
  {
    id: 'shoulder-dislocation',
    synonyms: ['shoulder dislocation', 'dislocated shoulder', 'glenohumeral dislocation'],
    related: ['shoulder instability', 'traumatic anterior shoulder instability'],
    evidence: ['bess-traumatic-anterior-shoulder-instability'],
  },
  // ── Anticoagulation ───────────────────────────────────────────────────────
  {
    id: 'vte',
    synonyms: ['VTE', 'venous thromboembolism', 'thromboprophylaxis', 'VTE prophylaxis'],
    related: ['DVT', 'deep vein thrombosis', 'pulmonary embolism', 'anticoagulation'],
    evidence: ['nice-apixaban-vte-ta245', 'bofas-vte-position-statement', 'bssh-vte-guidelines'],
  },
  // ── General ───────────────────────────────────────────────────────────────
  {
    id: 'oa',
    synonyms: ['OA', 'osteoarthritis', 'osteoarthritic'],
    related: ['arthritis', 'degenerative joint disease'],
    evidence: ['nice-osteoarthritis-ng226', 'nice-digital-oa-htg766', 'nice-supercapsular-tha-htg626'],
  },
  {
    id: 'msk',
    synonyms: ['MSK', 'musculoskeletal'],
    evidence: ['arterial-injury-msk-trauma', 'paediatric-msk-infection'],
  },
  {
    id: 'arthroscopy',
    synonyms: ['arthroscopy', 'arthroscopic'],
    related: ['keyhole surgery'],
    evidence: ['ebi-knee-arthroscopy-osteoarthritis', 'nice-arthroscopic-fai-htg273'],
  },
  {
    id: 'amputation',
    synonyms: ['amputation', 'amputations', 'traumatic amputation'],
    evidence: ['girft-traumatic-amputation-hand'],
  },
  {
    id: 'ebi',
    synonyms: ['EBI', 'evidence-based interventions', 'evidence based interventions'],
    evidence: ['nhs-ebi-programme', 'bess-ebi-list-2-guidance'],
  },
  {
    id: 'bpt',
    synonyms: ['BPT', 'best practice tariff'],
    evidence: ['bpt-fragility-hip-femur-fracture'],
  },
  {
    id: 'nhfd',
    synonyms: ['NHFD', 'National Hip Fracture Database'],
    evidence: ['nhfd-kpis', 'nhfd-annual-report-2025'],
  },
  // ── Publishers ────────────────────────────────────────────────────────────
  { id: 'nice', synonyms: ['NICE', 'National Institute for Health and Care Excellence'], evidence: ['nice-joint-replacement-ng157'] },
  { id: 'boa', synonyms: ['BOA', 'British Orthopaedic Association'], related: ['BOAST', 'BOASt', 'BOA standard'], evidence: ['open-fractures', 'compartment-syndrome'] },
  { id: 'boast', synonyms: ['BOAST', 'BOASt', 'BOASts', 'BOA standard', 'BOA standards'], evidence: ['open-fractures', 'ankle-fracture'] },
  { id: 'girft', synonyms: ['GIRFT', 'Getting It Right First Time'], evidence: ['girft-cauda-equina-pathway'] },
  { id: 'bssh', synonyms: ['BSSH', 'British Society for Surgery of the Hand'], evidence: ['bssh-best-guidelines'] },
  { id: 'bess', synonyms: ['BESS', 'British Elbow and Shoulder Society', 'British Elbow & Shoulder Society'], evidence: ['bess-frozen-shoulder'] },
  { id: 'bofas', synonyms: ['BOFAS', 'British Orthopaedic Foot and Ankle Society', 'British Orthopaedic Foot & Ankle Society'], evidence: ['bofas-pathways-of-care'] },
  { id: 'bask', synonyms: ['BASK', 'British Association for Surgery of the Knee'], evidence: ['bask-meniscal-surgery-guidelines'] },
  { id: 'bscos', synonyms: ['BSCOS', "British Society for Children's Orthopaedic Surgery"], evidence: ['bscos-ddh-consensus'] },
  { id: 'bhs', synonyms: ['BHS', 'British Hip Society'], evidence: ['bhs-fai-standard'] },
  { id: 'bass', synonyms: ['BASS', 'British Association of Spine Surgeons'], evidence: ['bass-cauda-equina-standards'] },
  { id: 'ros', synonyms: ['ROS', 'Royal Osteoporosis Society'], evidence: ['ros-fls-clinical-standards'] },
  { id: 'nogg', synonyms: ['NOGG', 'National Osteoporosis Guideline Group'], evidence: ['nogg-osteoporosis-guideline'] },
  { id: 'bajis', synonyms: ['BAJIS', 'Bone and Joint Infection Society', 'Bone & Joint Infection Society'], evidence: ['bajis-professional-resources'] },
  { id: 'ots', synonyms: ['OTS', 'Orthopaedic Trauma Society'], evidence: ['ots-orthopaedic-trauma-society'] },
  { id: 'bsg', synonyms: ['BSG', 'British Sarcoma Group'], evidence: ['bsg-bone-sarcoma-guidelines'] },
  { id: 'bostaa', synonyms: ['BOSTAA', 'British Orthopaedic Sports Trauma and Arthroscopy Association'], evidence: ['bostaa-acl-postop-protocols'] },
  { id: 'blrs', synonyms: ['BLRS', 'British Limb Reconstruction Society'], evidence: ['blrs-limb-reconstruction'] },
  { id: 'boos', synonyms: ['BOOS', 'British Orthopaedic Oncology Society'], evidence: ['boos-metastatic-bone-disease-policy'] },
  { id: 'bgs', synonyms: ['BGS', 'British Geriatrics Society'], evidence: ['boa-bgs-blue-book'] },
  { id: 'ukssb', synonyms: ['UKSSB', 'UK Spine Societies Board'], evidence: ['ukssb-spine-societies-board'] },
];

/** Entries by id, for tests. */
export function terminologyEntry(id: string): TermEntry | undefined {
  return TERMINOLOGY.find((e) => e.id === id);
}
