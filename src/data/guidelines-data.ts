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

  // ─── Original 9 records (unchanged) ───────────────────────────────────────

  {
    id: 'ces-acute-girft',
    section: 'Emergencies',
    topic: 'Cauda equina syndrome',
    subGroup: 'Acute presentation pathway',
    source: 'GIRFT',
    type: 'National guidance',
    summary: 'Red flag recognition, early MRI (within 4 hours), saddle numbness, bladder retention. Immediate referral in suspected cases.',
    regionalVariation: true,
    localOverlayNeeded: true,
    notes: 'Preserving both versions as requested. March 2026 pathway updates referral criteria.',
    lastChecked: '2026-04-01',
    status: 'Live',
    versions: [
      { label: 'March 2026 update', date: 'Mar 2026', url: 'https://gettingitrightfirsttime.co.uk/wp-content/uploads/2026/04/National-Suspected-Cauda-Equina-Pathway-March-2026.pdf' },
      { label: 'Version 3 (Archived)', date: 'Oct 2023', url: 'https://gettingitrightfirsttime.co.uk/wp-content/uploads/2023/10/CES-pathway-v3.pdf' }
    ]
  },
  {
    id: 'compartment-syndrome-boast',
    section: 'Emergencies',
    topic: 'Acute compartment syndrome',
    subGroup: 'Diagnosis and management',
    source: 'BOA',
    type: 'National guidance',
    summary: 'Pain out of proportion is the cardinal feature. Continuous pressure monitoring where clinical assessment is unreliable. Fasciotomy without delay once diagnosed.',
    regionalVariation: false,
    localOverlayNeeded: false,
    notes: 'Fasciotomy must decompress all four compartments in the lower leg.',
    lastChecked: '2025-06-01',
    status: 'Live',
    crossListedIn: ['Trauma'],
    versions: [
      { label: 'BOAST 10 — Acute compartment syndrome', date: 'CURRENT', url: 'https://www.boa.ac.uk/resource/boast-10-pdf.html' },
      { label: 'BOAST 10 — prior', date: '2016', url: '#' }
    ]
  },
  {
    id: 'open-fractures-boast',
    section: 'Emergencies',
    topic: 'Open fractures',
    subGroup: '',
    source: 'BOA',
    type: 'National guidance',
    summary: 'Combined ortho-plastic care. IV antibiotics within 1 hour. Surgery timing per contamination; primary closure where safe.',
    regionalVariation: true,
    localOverlayNeeded: true,
    notes: 'Co-badged with BAPRAS.',
    lastChecked: '2025-06-01',
    status: 'Live',
    versions: [
      { label: 'BOAST 4 — Open fractures', date: 'CURRENT', url: 'https://www.boa.ac.uk/resource/boast-4-pdf.html' }
    ]
  },
  {
    id: 'supracondylar-boast',
    section: 'Trauma',
    topic: 'Supracondylar fractures',
    subGroup: 'Paediatric trauma',
    source: 'BOA',
    type: 'National guidance',
    summary: 'Assess pulseless pink vs pulseless pale hand. Fixation with 2 or 3 crossed/divergent K-wires.',
    regionalVariation: false,
    localOverlayNeeded: false,
    notes: 'Urgent surgery if pulseless pale.',
    lastChecked: '2025-06-01',
    status: 'Live',
    versions: [
      { label: 'BOAST 11', date: 'CURRENT', url: 'https://www.boa.ac.uk/resource/boast-11-pdf.html' }
    ]
  },
  {
    id: 'ankle-fractures-boast',
    section: 'Trauma',
    topic: 'Ankle fractures',
    subGroup: '',
    source: 'BOA',
    type: 'National guidance',
    summary: 'Weight-bearing in a cast/boot as soon as tolerated post-op. VTE assessment mandatory.',
    regionalVariation: false,
    localOverlayNeeded: true,
    notes: '',
    lastChecked: '2025-06-01',
    status: 'Live',
    versions: [
      { label: 'BOAST 12', date: 'CURRENT', url: 'https://www.boa.ac.uk/resource/boast-12-pdf.html' }
    ]
  },
  {
    id: 'knee-arthroscopy-ebi',
    section: 'Knee',
    topic: 'Knee osteoarthritis',
    subGroup: 'Arthroscopy',
    source: 'EBI / NHS England',
    type: 'National guidance',
    summary: 'Arthroscopy should NOT be performed for osteoarthritis unless there is a clear history of true mechanical locking.',
    regionalVariation: false,
    localOverlayNeeded: false,
    notes: '',
    lastChecked: '2025-01-01',
    status: 'Live',
    versions: [
      { label: 'EBI Guidance', date: 'CURRENT', url: 'https://ebi.aomrc.org.uk/interventions/knee-arthroscopy-for-patients-with-osteoarthritis/' }
    ]
  },
  {
    id: 'ambulatory-arthroplasty-girft',
    section: 'Elective',
    topic: 'Hip and Knee Replacement',
    subGroup: 'Day case pathway',
    source: 'GIRFT',
    type: 'National guidance',
    summary: 'Provides a framework for setting up day-case hip and knee replacement pathways.',
    regionalVariation: true,
    localOverlayNeeded: true,
    notes: 'Pathway heavily depends on local community therapy support.',
    lastChecked: '2025-03-01',
    status: 'Live',
    versions: [
      { label: 'Ambulatory Guide', date: 'Mar 2023', url: 'https://gettingitrightfirsttime.co.uk/wp-content/uploads/2023/07/Ambulatory-Hip-and-Knee-Replacement-Guide-March-2023-FINAL-V1-1.pdf' }
    ]
  },
  {
    id: 'ces-red-flags-spine',
    section: 'Spine',
    topic: 'Cauda equina syndrome',
    subGroup: 'Red flags',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Bilateral sciatica, saddle anaesthesia, bladder/bowel dysfunction require urgent evaluation.',
    regionalVariation: false,
    localOverlayNeeded: false,
    notes: '',
    lastChecked: '2025-01-01',
    status: 'Live',
    versions: [
      { label: 'NG59', date: '2020', url: 'https://www.nice.org.uk/guidance/ng59' }
    ]
  },
  {
    id: 'qr-asa-grades',
    section: 'Quick Reference',
    topic: 'ASA Grades',
    subGroup: '',
    source: 'Quick Ref',
    type: 'Quick reference',
    summary: 'I: Normal healthy patient\nII: Mild systemic disease\nIII: Severe systemic disease\nIV: Severe systemic disease that is a constant threat to life\nV: Moribund patient not expected to survive without operation',
    regionalVariation: false,
    localOverlayNeeded: false,
    notes: '',
    lastChecked: '2025-01-01',
    status: 'Live',
    versions: []
  },

  // ─── BOA/BOASt Active Clinical Guidelines (26) ────────────────────────────

  {
    id: 'boast-hip-fracture',
    section: 'Trauma',
    topic: 'Hip fracture',
    subGroup: 'Fragility fractures',
    source: 'BOA',
    type: 'National guidance',
    summary: 'Prompt surgical fixation within 36 hours of admission. Cemented hemiarthroplasty for displaced intracapsular fractures in older adults; DHS or IM nail for extracapsular. Orthogeriatric co-management throughout.',
    regionalVariation: false,
    localOverlayNeeded: true,
    notes: 'Best Practice Tariff (BPT) criteria apply. Requires coordination with orthogeriatrics and anaesthetics pre-op.',
    lastChecked: '2026-01-01',
    status: 'Live',
    crossListedIn: ['Bone Health'],
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOAST — Hip fracture management', url: '' }
    ]
  },
  {
    id: 'boast-distal-radius',
    section: 'Trauma',
    topic: 'Distal radial fractures',
    subGroup: '',
    source: 'BOA',
    type: 'National guidance',
    summary: 'Assess for intra-articular involvement and instability. CR and cast for stable fractures. ORIF (volar plate) for unstable, displaced, or intra-articular fractures failing closed reduction. CT helps define complex intra-articular patterns.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2026-01-01',
    status: 'Live',
    crossListedIn: ['Hand & Wrist'],
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOAST — Distal radial fractures', url: '' }
    ]
  },
  {
    id: 'boast-tibial-shaft',
    section: 'Trauma',
    topic: 'Tibial shaft fractures',
    subGroup: '',
    source: 'BOA',
    type: 'National guidance',
    summary: 'IM nailing is the gold standard for most displaced tibial shaft fractures. Assess for associated compartment syndrome. Open fractures follow BOAST 4 pathway. Post-op weight-bearing as tolerated.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2026-01-01',
    status: 'Live',
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOAST — Tibial shaft fractures', url: '' }
    ]
  },
  {
    id: 'boast-vte-prophylaxis',
    section: 'Elective',
    topic: 'VTE prophylaxis in orthopaedic surgery',
    subGroup: 'Thromboprophylaxis',
    source: 'BOA',
    type: 'National guidance',
    summary: 'Risk-stratified VTE prophylaxis for all orthopaedic patients. LMWH or DOACs for elective hip/knee replacement. Mechanical prophylaxis where chemical is contraindicated. Duration: 28–35 days post hip replacement, 10–14 days post knee replacement.',
    regionalVariation: false,
    localOverlayNeeded: true,
    notes: 'Local pharmacy formulary determines DOAC choice. See also NICE NG89 and TA170/TA245/TA304.',
    lastChecked: '2026-01-01',
    status: 'Live',
    crossListedIn: ['Trauma'],
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOAST — VTE prophylaxis in orthopaedic surgery', url: '' }
    ]
  },
  {
    id: 'boast-spinal-cord-injury',
    section: 'Emergencies',
    topic: 'Spinal cord injury',
    subGroup: 'Acute management',
    source: 'BOA',
    type: 'National guidance',
    summary: 'Immobilise and transfer to regional SCI centre early. Avoid hypotension and hypoxia (MAP >85 mmHg). Methylprednisolone not routinely recommended. Early surgical decompression in incomplete injuries.',
    regionalVariation: true,
    localOverlayNeeded: true,
    notes: 'ISCOS classification. Transfer to designated SCI unit essential.',
    lastChecked: '2026-01-01',
    status: 'Live',
    crossListedIn: ['Spine'],
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOAST — Spinal cord injury', url: '' }
    ]
  },
  {
    id: 'boast-shoulder-dislocation',
    section: 'Shoulder & Elbow',
    topic: 'Shoulder dislocation',
    subGroup: 'Anterior dislocation',
    source: 'BOA',
    type: 'National guidance',
    summary: 'Prompt reduction under sedation/anaesthesia. Pre- and post-reduction neurovascular assessment (axillary nerve). Check for Hill-Sachs and bony Bankart on imaging. MRI recommended in young patients given high recurrence risk.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2026-01-01',
    status: 'Live',
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOAST — Shoulder dislocation', url: '' }
    ]
  },
  {
    id: 'boast-proximal-humerus',
    section: 'Trauma',
    topic: 'Proximal humeral fractures',
    subGroup: '',
    source: 'BOA',
    type: 'National guidance',
    summary: 'Most 2-part fractures managed non-operatively with early mobilisation. ORIF or reverse shoulder arthroplasty for complex 3/4-part fractures in older patients. Consider bone quality and patient activity level.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2026-01-01',
    status: 'Live',
    crossListedIn: ['Shoulder & Elbow'],
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOAST — Proximal humeral fractures', url: '' }
    ]
  },
  {
    id: 'boast-scaphoid',
    section: 'Hand & Wrist',
    topic: 'Scaphoid fractures',
    subGroup: '',
    source: 'BOA',
    type: 'National guidance',
    summary: 'Clinical suspicion with normal radiograph warrants MRI (gold standard) or CT. Undisplaced waist fractures can be cast; displaced or proximal pole fractures require fixation. Avascular necrosis risk highest with proximal pole injury.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2026-01-01',
    status: 'Live',
    crossListedIn: ['Trauma'],
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOAST — Scaphoid fractures', url: '' }
    ]
  },
  {
    id: 'boast-clavicle',
    section: 'Shoulder & Elbow',
    topic: 'Clavicle fractures',
    subGroup: '',
    source: 'BOA',
    type: 'National guidance',
    summary: 'Most midshaft clavicle fractures treated non-operatively with a broad arm sling. Operative fixation (plate) for markedly displaced/shortened fractures (>2 cm), open injuries, or neurovascular compromise.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2026-01-01',
    status: 'Live',
    crossListedIn: ['Trauma'],
    priority: 'medium',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOAST — Clavicle fractures', url: '' }
    ]
  },
  {
    id: 'boast-femoral-shaft',
    section: 'Trauma',
    topic: 'Femoral shaft fractures',
    subGroup: '',
    source: 'BOA',
    type: 'National guidance',
    summary: 'IM nailing is the treatment of choice for most femoral shaft fractures. Significant blood loss risk — transfuse early. Exclude ipsilateral neck fracture with CT hip pre-op. Traction splint pre-operatively.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2026-01-01',
    status: 'Live',
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOAST — Femoral shaft fractures', url: '' }
    ]
  },
  {
    id: 'boast-tibial-plateau',
    section: 'Trauma',
    topic: 'Tibial plateau fractures',
    subGroup: '',
    source: 'BOA',
    type: 'National guidance',
    summary: 'CT mandatory for surgical planning. Schatzker classification guides management. ORIF for displaced fractures; staged fixation (ex-fix then definitive) for high-energy bicolumnar injuries. Assess for compartment syndrome and vascular injury.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2026-01-01',
    status: 'Live',
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOAST — Tibial plateau fractures', url: '' }
    ]
  },
  {
    id: 'boast-distal-femur',
    section: 'Trauma',
    topic: 'Distal femoral fractures',
    subGroup: '',
    source: 'BOA',
    type: 'National guidance',
    summary: 'ORIF with locking plate or retrograde IM nail. CT aids preoperative planning. Periprosthetic variant requires dedicated implant strategy. High complication rate in elderly osteoporotic bone.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2026-01-01',
    status: 'Live',
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOAST — Distal femoral fractures', url: '' }
    ]
  },
  {
    id: 'boast-calcaneal',
    section: 'Foot & Ankle',
    topic: 'Calcaneal fractures',
    subGroup: 'Intra-articular',
    source: 'BOA',
    type: 'National guidance',
    summary: 'CT assessment of Böhler angle and posterior facet involvement. Non-operative for tongue-type or minimally displaced fractures. ORIF via extensile lateral or sinus tarsi approach for displaced intra-articular fractures in appropriate patients.',
    regionalVariation: false,
    localOverlayNeeded: false,
    notes: 'Skin condition must be assessed before surgery — wait for wrinkle sign.',
    lastChecked: '2026-01-01',
    status: 'Live',
    crossListedIn: ['Trauma'],
    priority: 'medium',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOAST — Displaced intra-articular calcaneal fractures', url: '' }
    ]
  },
  {
    id: 'boast-hip-dislocation',
    section: 'Trauma',
    topic: 'Hip dislocation',
    subGroup: 'Traumatic dislocation',
    source: 'BOA',
    type: 'National guidance',
    summary: 'Urgent closed reduction under general anaesthesia within 6 hours to minimise AVN risk. Post-reduction CT to exclude loose bodies or acetabular fracture. Physiotherapy-guided mobilisation. Follow-up MRI at 3 months to screen for AVN.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2026-01-01',
    status: 'Live',
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOAST — Traumatic hip dislocation', url: '' }
    ]
  },
  {
    id: 'boast-periprosthetic-fracture',
    section: 'Trauma',
    topic: 'Periprosthetic fractures',
    subGroup: 'Around hip and knee implants',
    source: 'BOA',
    type: 'National guidance',
    summary: 'Vancouver/Unified classification guides management. Assess implant stability. ORIF if implant stable; revision arthroplasty if loose. MDT discussion with arthroplasty team. Bone graft often needed.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2026-01-01',
    status: 'Live',
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOAST — Periprosthetic fractures', url: '' }
    ]
  },
  {
    id: 'boast-pji',
    section: 'Infection / Tumour',
    topic: 'Periprosthetic joint infection',
    subGroup: 'Hip and knee arthroplasty',
    source: 'BOA',
    type: 'National guidance',
    summary: 'MSIS criteria for diagnosis. ESR, CRP, aspiration, culture, and histology. Two-stage revision is gold standard for chronic PJI. DAIR considered for acute post-op or acute haematogenous PJI with well-fixed implant. Prolonged IV then oral antibiotics per microbiology guidance.',
    regionalVariation: true,
    localOverlayNeeded: true,
    notes: 'Requires close liaison with microbiologist and infection control.',
    lastChecked: '2026-01-01',
    status: 'Live',
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOAST — Periprosthetic joint infection', url: '' }
    ]
  },
  {
    id: 'boast-meniscal',
    section: 'Knee',
    topic: 'Meniscal injuries',
    subGroup: '',
    source: 'BOA',
    type: 'National guidance',
    summary: 'MRI for diagnosis. Peripheral (red-zone) tears repaired where possible, especially in younger patients. Degenerative tears in older patients managed with physiotherapy first. Meniscectomy only for locked knee or failed conservative treatment.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2026-01-01',
    status: 'Live',
    priority: 'medium',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOAST — Meniscal injuries', url: '' }
    ]
  },
  {
    id: 'boast-acl',
    section: 'Knee',
    topic: 'ACL injuries',
    subGroup: 'Anterior cruciate ligament',
    source: 'BOA',
    type: 'National guidance',
    summary: 'MRI confirms diagnosis. Supervised physiotherapy rehab (neuromuscular programme) is first-line. ACL reconstruction indicated in functionally unstable knees or in patients wishing to return to pivoting sport. Bone-tendon-bone or hamstring autograft preferred.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2026-01-01',
    status: 'Live',
    priority: 'medium',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOAST — Anterior cruciate ligament injuries', url: '' }
    ]
  },
  {
    id: 'boast-achilles',
    section: 'Foot & Ankle',
    topic: 'Achilles tendon rupture',
    subGroup: '',
    source: 'BOA',
    type: 'National guidance',
    summary: 'Ultrasound confirms diagnosis. Functional non-operative management (early weight-bearing in equinus boot) equivalent to surgical repair in most patients. Operative repair for younger, active patients or re-rupture. Accelerated rehabilitation key to outcome.',
    regionalVariation: false,
    localOverlayNeeded: true,
    lastChecked: '2026-01-01',
    status: 'Live',
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOAST — Achilles tendon rupture', url: '' }
    ]
  },
  {
    id: 'boast-paed-forearm',
    section: 'Paediatrics',
    topic: 'Paediatric forearm fractures',
    subGroup: 'Radius and ulna shaft',
    source: 'BOA',
    type: 'National guidance',
    summary: 'Remodelling potential significant under age 10. CR and above-elbow cast for most fractures. Elastic stable IM nailing for displaced midshaft fractures in older children or failure of CR. Beware Monteggia injury (proximal ulna fracture + radial head dislocation).',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2026-01-01',
    status: 'Live',
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOAST — Paediatric forearm fractures', url: '' }
    ]
  },
  {
    id: 'boast-metacarpal',
    section: 'Hand & Wrist',
    topic: 'Metacarpal fractures',
    subGroup: '',
    source: 'BOA',
    type: 'National guidance',
    summary: 'Assess rotational deformity clinically (scissoring). Buddy strapping and hand therapy for most fractures. ORIF or K-wire fixation for displaced/rotated fractures or those involving the index or little finger border digits.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2026-01-01',
    status: 'Live',
    priority: 'medium',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOAST — Metacarpal fractures', url: '' }
    ]
  },
  {
    id: 'boast-spinal-clearance',
    section: 'Emergencies',
    topic: 'Spinal clearance in trauma',
    subGroup: 'Cervical and thoracolumbar',
    source: 'BOA',
    type: 'National guidance',
    summary: 'NEXUS and Canadian C-spine rules for low-risk patients. CT cervical spine for moderate/high risk (high-energy mechanisms, altered consciousness, distracting injury). MRI for neurological deficit or ligamentous injury suspicion.',
    regionalVariation: false,
    localOverlayNeeded: true,
    lastChecked: '2026-01-01',
    status: 'Live',
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOAST — Spinal clearance in trauma', url: '' }
    ]
  },
  {
    id: 'boast-pelvic-ring',
    section: 'Trauma',
    topic: 'Pelvic ring injuries',
    subGroup: 'Major trauma',
    source: 'BOA',
    type: 'National guidance',
    summary: 'Pelvic binder immediately for suspected unstable pelvic fracture in haemodynamic compromise. ATLS principles. CT trauma series for staging. External fixation or C-clamp as damage control. Definitive ORIF at 3–5 days once stabilised.',
    regionalVariation: true,
    localOverlayNeeded: true,
    notes: 'Manage in major trauma centre. Involve vascular/IR for haemorrhage control.',
    lastChecked: '2026-01-01',
    status: 'Live',
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOAST — Pelvic ring injuries', url: '' }
    ]
  },
  {
    id: 'boast-fem-neck-young',
    section: 'Trauma',
    topic: 'Femoral neck fractures in young adults',
    subGroup: 'High-energy mechanism',
    source: 'BOA',
    type: 'National guidance',
    summary: 'Urgent surgical fixation within 6–12 hours to reduce AVN risk. Capsular haematoma aspiration before fixation may reduce AVN. Cannulated screws or sliding hip screw. High AVN and non-union rates — patient counselling essential.',
    regionalVariation: false,
    localOverlayNeeded: false,
    notes: 'Distinct from fragility hip fracture. Consider MRI in occult presentation.',
    lastChecked: '2026-01-01',
    status: 'Live',
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOAST — Femoral neck fractures in young adults', url: '' }
    ]
  },
  {
    id: 'boast-crush-injury',
    section: 'Emergencies',
    topic: 'Crush injuries and degloving',
    subGroup: 'Soft tissue trauma',
    source: 'BOA',
    type: 'National guidance',
    summary: 'Early aggressive IV fluid resuscitation. Myoglobinuria — forced alkaline diuresis. Monitor for compartment syndrome. Wound debridement and plastic surgery involvement for degloving. Amputation decision at senior level with combined ortho-plastic team.',
    regionalVariation: true,
    localOverlayNeeded: true,
    lastChecked: '2026-01-01',
    status: 'Live',
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOAST — Crush injuries', url: '' }
    ]
  },
  {
    id: 'boast-wrist-children',
    section: 'Paediatrics',
    topic: 'Distal radius fractures in children',
    subGroup: '',
    source: 'BOA',
    type: 'National guidance',
    summary: 'Significant remodelling potential, especially under 10 years. Acceptable angulation varies with age and plane. CR and cast for most fractures. K-wire or IM pin fixation for physeal injuries (Salter–Harris) failing CR.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2026-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOAST — Distal radius fractures in children', url: '' }
    ]
  },

  // ─── BOA Process / Pathway Documents (6) ──────────────────────────────────

  {
    id: 'boa-fracture-clinic-guide',
    section: 'Elective',
    topic: 'Fracture clinic standards',
    subGroup: 'Service delivery',
    source: 'BOA',
    type: 'National guidance',
    summary: 'Standard setting for effective fracture clinic provision. Virtual and in-person models. Timely specialist review, radiology review at first attendance, and therapy integration. Supports GIRFT objectives.',
    regionalVariation: true,
    localOverlayNeeded: true,
    lastChecked: '2026-01-01',
    status: 'Live',
    priority: 'medium',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOA — Getting it Right in Fracture Clinics', url: '' }
    ]
  },
  {
    id: 'boa-safe-elective',
    section: 'Elective',
    topic: 'Safe elective orthopaedic surgery environment',
    subGroup: 'Service delivery',
    source: 'BOA',
    type: 'National guidance',
    summary: 'Criteria for safe delivery of elective orthopaedic surgery including joint replacement. Dedicated orthopaedic wards, clean air theatres, laminar flow for implant surgery, and pre-operative pathways to reduce infection risk.',
    regionalVariation: true,
    localOverlayNeeded: true,
    lastChecked: '2026-01-01',
    status: 'Live',
    priority: 'medium',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOA — Safe elective orthopaedic surgery', url: '' }
    ]
  },
  {
    id: 'boa-outpatient-services',
    section: 'Elective',
    topic: 'Orthopaedic outpatient and clinic services',
    subGroup: 'Service delivery',
    source: 'BOA',
    type: 'National guidance',
    summary: 'Framework for efficient orthopaedic outpatient provision. MSK triage, direct access physiotherapy, advice and guidance pathways, and first-contact practitioners to reduce unnecessary new outpatient referrals.',
    regionalVariation: true,
    localOverlayNeeded: true,
    lastChecked: '2026-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOA — Outpatient services guidance', url: '' }
    ]
  },
  {
    id: 'boa-fls-guide',
    section: 'Bone Health',
    topic: 'Fracture Liaison Services',
    subGroup: 'Secondary fracture prevention',
    source: 'BOA',
    type: 'National guidance',
    summary: 'FLS captures fragility fracture patients for secondary prevention. DXA, FRAX risk assessment, falls referral, and bone protection medication initiation. FLS coordinator model. Systematic identification and follow-up of all fragility fracture patients.',
    regionalVariation: true,
    localOverlayNeeded: true,
    notes: 'RCPLondon and IOF standards also apply. Closely linked to NICE NG207.',
    lastChecked: '2026-01-01',
    status: 'Live',
    priority: 'medium',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOA — Fracture Liaison Services guidance', url: '' }
    ]
  },
  {
    id: 'boa-frail-older-patients',
    section: 'Trauma',
    topic: 'Care of older and frail orthopaedic patients',
    subGroup: 'Orthogeriatrics',
    source: 'BOA',
    type: 'National guidance',
    summary: 'Orthogeriatric co-management model for older patients with fractures and elective orthopaedic surgery. Proactive geriatric assessment, delirium prevention, falls assessment, medication review, and discharge planning.',
    regionalVariation: true,
    localOverlayNeeded: true,
    lastChecked: '2026-01-01',
    status: 'Live',
    crossListedIn: ['Elective'],
    priority: 'medium',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOA — Care of patients with fragility fractures (Blue Book)', url: '' }
    ]
  },
  {
    id: 'boa-oncall-services',
    section: 'Emergencies',
    topic: 'On-call orthopaedic services',
    subGroup: 'Service delivery',
    source: 'BOA',
    type: 'National guidance',
    summary: 'Principles for safe and effective on-call orthopaedic cover. Supervision levels for trainees, consultant availability, handover requirements, and triage of on-call workload.',
    regionalVariation: true,
    localOverlayNeeded: true,
    lastChecked: '2026-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOA — On-call orthopaedic services guidance', url: '' }
    ]
  },

  // ─── SpecS (Specialist Society Guides) (2) ────────────────────────────────

  {
    id: 'specs-ortho-trauma',
    section: 'Quick Reference',
    topic: 'SpecS orthopaedic trauma guide',
    subGroup: 'SpR reference',
    source: 'SpecS',
    type: 'Specialist society guidance',
    summary: 'Specialist registrar reference guide covering acute orthopaedic trauma. Fracture assessment, operative techniques overview, perioperative management, and common pitfalls. Designed for trainees.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2026-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'SpecS — Orthopaedic trauma handbook', url: '' }
    ]
  },
  {
    id: 'specs-elective-ortho',
    section: 'Quick Reference',
    topic: 'SpecS elective orthopaedics guide',
    subGroup: 'SpR reference',
    source: 'SpecS',
    type: 'Specialist society guidance',
    summary: 'Specialist registrar reference covering elective orthopaedic conditions. Pre-operative assessment, surgical approaches, and post-operative management for joint replacement and soft tissue surgery.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2026-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'SpecS — Elective orthopaedics handbook', url: '' }
    ]
  },

  // ─── Archived BOASts (9) ──────────────────────────────────────────────────

  {
    id: 'boast-arterial-injuries-arch',
    section: 'Emergencies',
    topic: 'Arterial injuries in limb trauma',
    subGroup: 'Archived',
    source: 'BOA',
    type: 'National guidance',
    summary: 'ARCHIVED. Previous BOA standard on management of arterial injuries associated with limb fractures and dislocations. Superseded by updated vascular surgery and orthopaedic joint guidance.',
    regionalVariation: false,
    localOverlayNeeded: false,
    notes: 'Archived. Refer to current vascular surgery guidelines for active use.',
    lastChecked: '2024-01-01',
    status: 'Archived',
    archived: true,
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOAST — Arterial injuries in limb trauma (archived)', url: '' }
    ]
  },
  {
    id: 'boast-fracture-clinic-arch',
    section: 'Elective',
    topic: 'Fracture clinic provision',
    subGroup: 'Archived',
    source: 'BOA',
    type: 'National guidance',
    summary: 'ARCHIVED. Previous BOA standard for fracture clinic organisation and standards. Superseded by updated fracture clinic and GIRFT guidance.',
    regionalVariation: false,
    localOverlayNeeded: false,
    notes: 'Archived. See boa-fracture-clinic-guide for current guidance.',
    lastChecked: '2024-01-01',
    status: 'Archived',
    archived: true,
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOAST — Fracture clinic standards (archived)', url: '' }
    ]
  },
  {
    id: 'boast-fls-arch',
    section: 'Bone Health',
    topic: 'Fracture Liaison Services',
    subGroup: 'Archived',
    source: 'BOA',
    type: 'National guidance',
    summary: 'ARCHIVED. Previous BOA standard for Fracture Liaison Service provision. Superseded by updated BOA FLS guidance and RCPLondon standards.',
    regionalVariation: false,
    localOverlayNeeded: false,
    notes: 'Archived. See boa-fls-guide for current guidance.',
    lastChecked: '2024-01-01',
    status: 'Archived',
    archived: true,
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOAST — Fracture Liaison Services (archived)', url: '' }
    ]
  },
  {
    id: 'boast-compartment-limbs-arch',
    section: 'Emergencies',
    topic: 'Compartment syndrome of the limbs',
    subGroup: 'Archived',
    source: 'BOA',
    type: 'National guidance',
    summary: 'ARCHIVED. Previous BOA standard on compartment syndrome. Superseded by BOAST 10 — Acute Compartment Syndrome.',
    regionalVariation: false,
    localOverlayNeeded: false,
    notes: 'Archived. Refer to compartment-syndrome-boast (BOAST 10) for current guidance.',
    lastChecked: '2024-01-01',
    status: 'Archived',
    archived: true,
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOAST — Compartment syndrome of the limbs (archived)', url: '' }
    ]
  },
  {
    id: 'boast-cervical-clearance-arch',
    section: 'Emergencies',
    topic: 'Cervical spine clearance in trauma',
    subGroup: 'Archived',
    source: 'BOA',
    type: 'National guidance',
    summary: 'ARCHIVED. Previous BOA standard for cervical spine clearance in trauma patients. Superseded by updated spinal clearance guidance incorporating NEXUS and Canadian C-spine rules.',
    regionalVariation: false,
    localOverlayNeeded: false,
    notes: 'Archived. See boast-spinal-clearance for current guidance.',
    lastChecked: '2024-01-01',
    status: 'Archived',
    archived: true,
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOAST — Cervical spine clearance (archived)', url: '' }
    ]
  },
  {
    id: 'boast-blunt-chest-arch',
    section: 'Trauma',
    topic: 'Blunt chest wall injury',
    subGroup: 'Archived',
    source: 'BOA',
    type: 'National guidance',
    summary: 'ARCHIVED. Previous BOA standard on management of rib fractures and flail chest injuries in the context of polytrauma. Now managed under major trauma centre protocols.',
    regionalVariation: false,
    localOverlayNeeded: false,
    notes: 'Archived. Refer to major trauma centre and NICE guidance for current management.',
    lastChecked: '2024-01-01',
    status: 'Archived',
    archived: true,
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOAST — Blunt chest wall injury (archived)', url: '' }
    ]
  },
  {
    id: 'boast-covid-arch',
    section: 'Elective',
    topic: 'COVID-19 orthopaedic service guidance',
    subGroup: 'Archived',
    source: 'BOA',
    type: 'National guidance',
    summary: 'ARCHIVED. BOA guidance on orthopaedic service delivery during the COVID-19 pandemic. Covered patient triage, PPE, green pathway surgery, and restarting elective services. No longer applicable.',
    regionalVariation: false,
    localOverlayNeeded: false,
    notes: 'Archived. Published 2020–2021 during pandemic. No longer operational.',
    lastChecked: '2024-01-01',
    status: 'Archived',
    archived: true,
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOA — COVID-19 guidance (archived)', date: '2020', url: '' }
    ]
  },
  {
    id: 'boast-fragility-hip-arch',
    section: 'Trauma',
    topic: 'Fragility hip fracture pathway',
    subGroup: 'Archived',
    source: 'BOA',
    type: 'National guidance',
    summary: 'ARCHIVED. Previous BOA standard for fragility hip fracture management. Superseded by updated BOA hip fracture BOAST and NICE CG124.',
    regionalVariation: false,
    localOverlayNeeded: false,
    notes: 'Archived. See boast-hip-fracture and nice-cg124-hip for current guidance.',
    lastChecked: '2024-01-01',
    status: 'Archived',
    archived: true,
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOAST — Fragility hip fracture (archived)', url: '' }
    ]
  },
  {
    id: 'boast-nat-guide-arch',
    section: 'Quick Reference',
    topic: 'Archived BOA national guidelines index',
    subGroup: 'Archived',
    source: 'BOA',
    type: 'National guidance',
    summary: 'ARCHIVED. Index of previous BOA national guidelines superseded by current BOASts and updated clinical standards. Retained for historical reference.',
    regionalVariation: false,
    localOverlayNeeded: false,
    notes: 'Archived reference only.',
    lastChecked: '2024-01-01',
    status: 'Archived',
    archived: true,
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'BOA — Archived guidelines index', url: '' }
    ]
  },

  // ─── NICE Guidelines (NG / CG) — 25 records ───────────────────────────────

  {
    id: 'nice-ng59-lbp',
    section: 'Spine',
    topic: 'Low back pain and sciatica',
    subGroup: 'NICE guideline NG59',
    source: 'NICE',
    type: 'National guidance',
    summary: 'First-line: exercise, manual therapy, and psychological therapy. Do not offer X-ray routinely. MRI only if result will change management. Offer pharmacological analgesia in a time-limited fashion. Consider referral for radiculopathy not resolving at 4–6 weeks.',
    regionalVariation: false,
    localOverlayNeeded: false,
    notes: 'Also covers CES red flags — see ces-red-flags-spine.',
    lastChecked: '2025-01-01',
    status: 'Live',
    crossListedIn: ['Emergencies'],
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NG59 — Low back pain and sciatica in over 16s', date: '2020', url: 'https://www.nice.org.uk/guidance/ng59' }
    ]
  },
  {
    id: 'nice-cg124-hip',
    section: 'Trauma',
    topic: 'Hip fracture management',
    subGroup: 'NICE guideline CG124',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Surgery within 36 hours. Spinal anaesthesia preferred. Cemented hemiarthroplasty for displaced intracapsular fractures in frail patients. Total hip replacement if mobile and cognitively intact. DHS for extracapsular fractures. Orthogeriatric multidisciplinary care.',
    regionalVariation: false,
    localOverlayNeeded: true,
    lastChecked: '2025-01-01',
    status: 'Live',
    crossListedIn: ['Bone Health'],
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'CG124 — Hip fracture management', date: '2011', url: 'https://www.nice.org.uk/guidance/cg124' }
    ]
  },
  {
    id: 'nice-ng207-osteoporosis',
    section: 'Bone Health',
    topic: 'Osteoporosis: fragility fracture risk assessment',
    subGroup: 'NICE guideline NG207',
    source: 'NICE',
    type: 'National guidance',
    summary: 'FRAX risk assessment for all women ≥65 and men ≥75. DXA for those with FRAX above assessment threshold. Treat if fragility fracture risk exceeds intervention threshold. First-line: alendronate. Review annually.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NG207 — Osteoporosis: assessing the risk of fragility fracture', date: '2023', url: 'https://www.nice.org.uk/guidance/ng207' }
    ]
  },
  {
    id: 'nice-cg146-oa',
    section: 'Knee',
    topic: 'Osteoarthritis: care and management',
    subGroup: 'NICE guideline CG146',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Core treatments for all: education, exercise, weight management. Topical NSAIDs before oral. Oral NSAIDs/COX-2 with gastroprotection. Intra-articular corticosteroids for short-term pain relief. Joint replacement when function significantly impaired and conservative treatment failed.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    crossListedIn: ['Elective'],
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'CG146 — Osteoarthritis care and management', date: '2014', url: 'https://www.nice.org.uk/guidance/cg146' }
    ]
  },
  {
    id: 'nice-ng226-oa',
    section: 'Knee',
    topic: 'Osteoarthritis in over 16s',
    subGroup: 'NICE guideline NG226',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Updated guidance (2022) superseding CG146. Emphasises personalised care, shared decision making, self-management education, and exercise. Strengthens position on weight management. Clearer criteria for referral and joint replacement timing.',
    regionalVariation: false,
    localOverlayNeeded: false,
    notes: 'Supersedes CG146. Check NICE website for the latest version.',
    lastChecked: '2025-01-01',
    status: 'Live',
    crossListedIn: ['Elective', 'Shoulder & Elbow'],
    priority: 'medium',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NG226 — Osteoarthritis in over 16s', date: '2022', url: '' }
    ]
  },
  {
    id: 'nice-cg167-falls',
    section: 'Bone Health',
    topic: 'Falls: assessment and prevention in older people',
    subGroup: 'NICE guideline CG167',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Multifactorial falls assessment for all presenting with a fall. Includes gait, balance, muscle strength, osteoporosis risk, medication review, cardiovascular assessment, and environmental factors. Multifactorial intervention programme recommended.',
    regionalVariation: false,
    localOverlayNeeded: true,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'CG167 — Falls: assessment and prevention in older people', date: '2013', url: 'https://www.nice.org.uk/guidance/cg167' }
    ]
  },
  {
    id: 'nice-ng100-ra',
    section: 'Elective',
    topic: 'Rheumatoid arthritis in adults',
    subGroup: 'NICE guideline NG100',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Early DMARD therapy (methotrexate first-line) within 3 months of symptom onset. Treat-to-target strategy aiming for remission or low disease activity. Biologics/JAK inhibitors if conventional DMARDs fail. Surgery for joint damage and functional impairment unresponsive to medical management.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NG100 — Rheumatoid arthritis management', date: '2018', url: 'https://www.nice.org.uk/guidance/ng100' }
    ]
  },
  {
    id: 'nice-ng143-diabetic-foot',
    section: 'Foot & Ankle',
    topic: 'Diabetic foot problems',
    subGroup: 'NICE guideline NG143',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Assess all new hospital patients for diabetic foot risk on admission. Multidisciplinary foot care team for active diabetic foot problems. Total contact casting for diabetic foot ulcers. IV antibiotics for systemic infection or suspected osteomyelitis.',
    regionalVariation: false,
    localOverlayNeeded: true,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NG143 — Diabetic foot problems', date: '2019', url: 'https://www.nice.org.uk/guidance/ng143' }
    ]
  },
  {
    id: 'nice-ng41-cancer',
    section: 'Infection / Tumour',
    topic: 'Suspected cancer: soft tissue and bone sarcoma',
    subGroup: 'NICE guideline NG41',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Urgent direct access MRI (within 2 weeks) for unexplained lump ≥5 cm, deep to fascia, or growing. Urgent referral for suspected bone sarcoma. Do not biopsy before specialist sarcoma unit review.',
    regionalVariation: false,
    localOverlayNeeded: false,
    notes: 'Do not arrange biopsy in primary care or non-specialist setting.',
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NG41 — Suspected cancer: recognition and referral', date: '2023', url: 'https://www.nice.org.uk/guidance/ng41' }
    ]
  },
  {
    id: 'nice-ng12-cancer',
    section: 'Infection / Tumour',
    topic: 'Suspected cancer: recognition and referral (general)',
    subGroup: 'NICE guideline NG12',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Urgent 2-week wait referral criteria for suspected cancers including musculoskeletal. Bone pain in absence of trauma with positive imaging requires urgent referral to appropriate team.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NG12 — Suspected cancer recognition and referral', date: '2023', url: 'https://www.nice.org.uk/guidance/ng12' }
    ]
  },
  {
    id: 'nice-cg92-vte',
    section: 'Elective',
    topic: 'VTE prevention in hospital patients',
    subGroup: 'NICE guideline CG92',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Assess VTE and bleeding risk on admission. Offer pharmacological and mechanical prophylaxis based on individual risk. LMWH standard. Surgical patients at high VTE risk require extended prophylaxis post-discharge.',
    regionalVariation: false,
    localOverlayNeeded: true,
    crossListedIn: ['Trauma'],
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'CG92 — Venous thromboembolism: reducing the risk', date: '2010', url: 'https://www.nice.org.uk/guidance/cg92' }
    ]
  },
  {
    id: 'nice-ng89-vte',
    section: 'Elective',
    topic: 'Venous thromboembolic diseases: diagnosis and management',
    subGroup: 'NICE guideline NG89',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Diagnosis and management of DVT and PE. Wells score and D-dimer for DVT diagnosis. Direct oral anticoagulants (rivaroxaban, apixaban) preferred over LMWH-warfarin for most patients. Duration based on provoked vs unprovoked VTE.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    crossListedIn: ['Trauma'],
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NG89 — Venous thromboembolic diseases', date: '2023', url: 'https://www.nice.org.uk/guidance/ng89' }
    ]
  },
  {
    id: 'nice-ng96-scoliosis',
    section: 'Spine',
    topic: 'Scoliosis: diagnosis and management',
    subGroup: 'NICE guideline NG96',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Paediatric and adolescent scoliosis management. Cobb angle measurement, bracing for moderate curves (25–40°) in growing patients, surgical referral for progressive curves >45°. Clear referral pathways to specialist spinal units.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    crossListedIn: ['Paediatrics'],
    priority: 'medium',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NG96 — Scoliosis: diagnosis and management', date: '2016', url: 'https://www.nice.org.uk/guidance/ng96' }
    ]
  },
  {
    id: 'nice-ng87-spinal-injury',
    section: 'Emergencies',
    topic: 'Spinal injury: assessment and initial management',
    subGroup: 'NICE guideline NG87',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Immediate assessment and immobilisation. Manual in-line stabilisation. CT for suspected injury. Transfer to specialist SCI unit within 4 hours. Early catheterisation. Pressure ulcer prevention.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    crossListedIn: ['Spine'],
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NG87 — Spinal injury: assessment and initial management', date: '2016', url: '' }
    ]
  },
  {
    id: 'nice-cg153-ra',
    section: 'Elective',
    topic: 'Rheumatoid arthritis in adults (earlier guidance)',
    subGroup: 'NICE guideline CG153',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Earlier NICE guidance on RA management. Disease-modifying antirheumatic drug (DMARD) therapy, monitoring, and shared decision-making. Largely superseded by NG100.',
    regionalVariation: false,
    localOverlayNeeded: false,
    notes: 'Largely superseded by NG100. Retained for historical context.',
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'CG153 — Rheumatoid arthritis in adults', date: '2009', url: '' }
    ]
  },
  {
    id: 'nice-cg69-osteoporosis-secondary',
    section: 'Bone Health',
    topic: 'Osteoporosis: secondary prevention of fragility fractures',
    subGroup: 'NICE guideline CG69',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Bisphosphonate therapy for secondary prevention after fragility fracture in postmenopausal women. Risk stratification by age and DXA T-score. Largely superseded by NG207 but referenced in older protocols.',
    regionalVariation: false,
    localOverlayNeeded: false,
    notes: 'Largely superseded by NG207.',
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'CG69 — Osteoporosis: secondary prevention', date: '2008', url: '' }
    ]
  },
  {
    id: 'nice-ng34-falls-prev',
    section: 'Bone Health',
    topic: 'Falls prevention in older people',
    subGroup: 'NICE guideline',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Community-based falls prevention. Tai chi, balance training, and strength exercises for older people at risk. Vitamin D supplementation for those at risk. Home hazard assessment and modification.',
    regionalVariation: false,
    localOverlayNeeded: true,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NICE — Falls prevention in older people', url: '' }
    ]
  },
  {
    id: 'nice-ng53-sepsis',
    section: 'Infection / Tumour',
    topic: 'Sepsis: recognition, diagnosis and early management',
    subGroup: 'NICE guideline NG53',
    source: 'NICE',
    type: 'National guidance',
    summary: 'NEWS2 score for early sepsis recognition. Sepsis Six bundle within 1 hour for high-risk patients. Blood cultures before antibiotics where safe. IV broad-spectrum antibiotics immediately. Source control and senior review.',
    regionalVariation: false,
    localOverlayNeeded: true,
    lastChecked: '2025-01-01',
    status: 'Live',
    crossListedIn: ['Emergencies'],
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NG53 — Sepsis: recognition, diagnosis and early management', date: '2016', url: 'https://www.nice.org.uk/guidance/ng53' }
    ]
  },
  {
    id: 'nice-ng157-chronic-pain',
    section: 'Spine',
    topic: 'Chronic primary pain',
    subGroup: 'NICE guideline NG157',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Biopsychosocial approach. Exercise, psychological therapy (CBT, acceptance-based), and acupuncture. Paracetamol, NSAIDs, and opioids not recommended for chronic primary pain. Shared decision-making and self-management support.',
    regionalVariation: false,
    localOverlayNeeded: false,
    notes: 'Major change from previous practice: opioids not recommended.',
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NG157 — Chronic pain: assessment and management', date: '2021', url: '' }
    ]
  },
  {
    id: 'nice-ng218-gout',
    section: 'Elective',
    topic: 'Gout',
    subGroup: 'NICE guideline NG218',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Confirm diagnosis with joint aspiration and crystal identification where possible. Colchicine, NSAIDs, or steroids for acute attacks. Urate-lowering therapy (allopurinol first-line) for recurrent gout, tophi, or urate nephropathy.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NG218 — Gout', date: '2022', url: '' }
    ]
  },
  {
    id: 'nice-ng44-multimorbidity',
    section: 'Elective',
    topic: 'Multimorbidity: clinical assessment and management',
    subGroup: 'NICE guideline NG44',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Consider treatment burden and patient priorities in those with multiple conditions. Medication review to reduce polypharmacy. Relevant to orthopaedic patients with complex medical histories requiring elective surgery.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NG44 — Multimorbidity: clinical assessment and management', date: '2016', url: '' }
    ]
  },
  {
    id: 'nice-ng108-rehab',
    section: 'Elective',
    topic: 'Rehabilitation after critical illness or injury',
    subGroup: 'NICE guideline NG108',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Structured rehabilitation for patients after ICU admission or major injury. Early goal setting, cognitive and physical rehabilitation, and psychological support. Relevant to polytrauma and post-arthroplasty patients requiring prolonged recovery.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NG108 — Rehabilitation after critical illness and injury', date: '2017', url: '' }
    ]
  },
  {
    id: 'nice-ng74-perioperative',
    section: 'Elective',
    topic: 'Perioperative care in adults',
    subGroup: 'NICE guideline NG74',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Preoperative assessment and optimisation. Enhanced recovery after surgery (ERAS) principles. Surgical safety checklist use. Minimising fasting times. Post-operative monitoring and discharge criteria.',
    regionalVariation: false,
    localOverlayNeeded: true,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NG74 — Perioperative care in adults', date: '2016', url: '' }
    ]
  },
  {
    id: 'nice-ng82-falls-care-homes',
    section: 'Bone Health',
    topic: 'Falls prevention in care homes and hospitals',
    subGroup: 'NICE guideline NG82',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Multifactorial falls risk assessment for older people in care homes and hospitals. Environmental safety, medication review, hip protectors for those at high risk of hip fracture, and staff training.',
    regionalVariation: false,
    localOverlayNeeded: true,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NG82 — Falls: assessment and prevention in older people', date: '2004', url: '' }
    ]
  },

  {
    id: 'nice-ng28-diabetes-t2',
    section: 'Elective',
    topic: 'Type 2 diabetes in adults: management',
    subGroup: 'NICE guideline NG28',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Peri-operative glucose management for diabetic patients undergoing orthopaedic surgery. Charcot neuroarthropathy pathway. Annual foot care review. Target HbA1c for elective procedures. Sick-day rules and insulin adjustment guidance.',
    regionalVariation: false,
    localOverlayNeeded: true,
    notes: 'Particularly relevant for perioperative management of diabetic patients and those with Charcot joints.',
    lastChecked: '2025-01-01',
    status: 'Live',
    crossListedIn: ['Foot & Ankle'],
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NG28 — Type 2 diabetes in adults: management', date: '2022', url: '' }
    ]
  },

  // ─── NICE Quality Standards (QS) — 10 records ─────────────────────────────

  {
    id: 'nice-qs16-hip-fracture',
    section: 'Trauma',
    topic: 'Hip fracture quality standard',
    subGroup: 'NICE Quality Standard QS16',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Quality statements for hip fracture care: surgery within 36 hours, orthogeriatric assessment, DXA, falls assessment, and bone protection on discharge. Underpins NHFD audit metrics and Best Practice Tariff.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'QS16 — Hip fracture', date: '2012', url: 'https://www.nice.org.uk/guidance/qs16' }
    ]
  },
  {
    id: 'nice-qs22-oa',
    section: 'Knee',
    topic: 'Osteoarthritis quality standard',
    subGroup: 'NICE Quality Standard QS22',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Quality statements for OA management: education and self-management, exercise, weight management, access to physiotherapy, and timely referral for joint replacement.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    crossListedIn: ['Elective'],
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'QS22 — Osteoarthritis', date: '2012', url: '' }
    ]
  },
  {
    id: 'nice-qs99-falls',
    section: 'Bone Health',
    topic: 'Falls in older people quality standard',
    subGroup: 'NICE Quality Standard QS99',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Quality statements for falls assessment and prevention: multifactorial risk assessment, personalised care plan, bone health assessment, strength and balance training.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'QS99 — Falls in older people', date: '2015', url: '' }
    ]
  },
  {
    id: 'nice-qs147-osteoporosis',
    section: 'Bone Health',
    topic: 'Osteoporosis quality standard',
    subGroup: 'NICE Quality Standard QS147',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Quality statements for osteoporosis: risk assessment in primary care, DXA scanning, fragility fracture follow-up, FLS provision, and bone-protection therapy adherence.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'QS147 — Osteoporosis', date: '2017', url: '' }
    ]
  },
  {
    id: 'nice-qs123-ra',
    section: 'Elective',
    topic: 'Rheumatoid arthritis quality standard',
    subGroup: 'NICE Quality Standard QS123',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Quality statements for RA: early diagnosis, prompt DMARD initiation, treat-to-target monitoring, biologics access, and surgical input when functionally impaired.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'QS123 — Rheumatoid arthritis', date: '2016', url: '' }
    ]
  },
  {
    id: 'nice-qs74-diabetic-foot',
    section: 'Foot & Ankle',
    topic: 'Diabetic foot care quality standard',
    subGroup: 'NICE Quality Standard QS74',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Quality statements: foot risk assessment on hospital admission, multidisciplinary diabetic foot team access, total contact casting for foot ulcers, and offloading compliance.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'QS74 — Diabetic foot problems', date: '2014', url: '' }
    ]
  },
  {
    id: 'nice-qs45-falls-hosp',
    section: 'Bone Health',
    topic: 'Falls prevention in hospital quality standard',
    subGroup: 'NICE Quality Standard QS45',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Quality statements for inpatient fall prevention: patient-level risk assessment, personalised care plan, footwear assessment, environmental checks, and post-fall review process.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'QS45 — Falls: assessment and prevention in hospitals', date: '2013', url: '' }
    ]
  },
  {
    id: 'nice-qs113-bone-health',
    section: 'Bone Health',
    topic: 'Osteoporosis and bone health quality standard',
    subGroup: 'NICE Quality Standard',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Quality framework for secondary fracture prevention and bone health services. Addresses identification, investigation, and management of patients at risk of fragility fracture.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NICE QS — Osteoporosis and bone health', url: '' }
    ]
  },
  {
    id: 'nice-qs32-oa-hip',
    section: 'Elective',
    topic: 'Osteoarthritis management quality standard',
    subGroup: 'NICE Quality Standard',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Quality statements covering core OA management across hip, knee, and other joints. Exercise, physiotherapy, weight management, and timely joint replacement referral.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NICE QS — Osteoarthritis management', url: '' }
    ]
  },
  {
    id: 'nice-qs33-spinal',
    section: 'Spine',
    topic: 'Spinal conditions quality standard',
    subGroup: 'NICE Quality Standard',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Quality statements for spinal conditions including back pain: physiotherapy-led management, appropriate imaging, MDT input, and specialist referral pathways.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NICE QS — Spinal conditions', url: '' }
    ]
  },

  // ─── NICE Technology Appraisals (TA) — 15 records ─────────────────────────

  {
    id: 'nice-ta170-rivaroxaban',
    section: 'Elective',
    topic: 'Rivaroxaban for VTE prevention (hip/knee replacement)',
    subGroup: 'NICE Technology Appraisal TA170',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Rivaroxaban (Xarelto) recommended for adults having elective total hip or total knee replacement. For hip replacement: 35-day course. For knee replacement: 14-day course. Preferred over LMWH in eligible patients.',
    regionalVariation: false,
    localOverlayNeeded: true,
    notes: 'Local formulary determines which DOAC is preferred. See also TA245, TA304.',
    lastChecked: '2025-01-01',
    status: 'Live',
    crossListedIn: ['Trauma'],
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'TA170 — Rivaroxaban for VTE prevention after hip or knee replacement', date: '2009', url: 'https://www.nice.org.uk/guidance/ta170' }
    ]
  },
  {
    id: 'nice-ta245-apixaban',
    section: 'Elective',
    topic: 'Apixaban for VTE prevention (hip/knee replacement)',
    subGroup: 'NICE Technology Appraisal TA245',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Apixaban (Eliquis) recommended for VTE prevention in adults after elective hip or knee replacement. 35 days for hip; 12 days for knee. Taken twice daily.',
    regionalVariation: false,
    localOverlayNeeded: true,
    lastChecked: '2025-01-01',
    status: 'Live',
    crossListedIn: ['Trauma'],
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'TA245 — Apixaban for VTE prevention after hip or knee replacement', date: '2012', url: '' }
    ]
  },
  {
    id: 'nice-ta304-dabigatran',
    section: 'Elective',
    topic: 'Dabigatran for VTE prevention (hip/knee replacement)',
    subGroup: 'NICE Technology Appraisal TA304',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Dabigatran etexilate (Pradaxa) recommended for VTE prevention in adults after elective total hip or total knee replacement. Half-dose on day of surgery, then full dose daily thereafter.',
    regionalVariation: false,
    localOverlayNeeded: true,
    lastChecked: '2025-01-01',
    status: 'Live',
    crossListedIn: ['Trauma'],
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'TA304 — Dabigatran etexilate for VTE prevention after hip or knee replacement', date: '2014', url: 'https://www.nice.org.uk/guidance/ta304' }
    ]
  },
  {
    id: 'nice-ta204-bisphosphonates',
    section: 'Bone Health',
    topic: 'Bisphosphonates for primary prevention of osteoporotic fractures',
    subGroup: 'NICE Technology Appraisal TA204',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Alendronate first-line for primary prevention of osteoporotic fragility fractures in post-menopausal women. Risedronate, etidronate, and strontium ranelate as alternatives. Decision based on age, T-score, and independent risk factors.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'high',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'TA204 — Alendronate and other treatments for osteoporosis primary prevention', date: '2011', url: 'https://www.nice.org.uk/guidance/ta204' }
    ]
  },
  {
    id: 'nice-ta160-bisphosphonates-secondary',
    section: 'Bone Health',
    topic: 'Bisphosphonates for secondary prevention of osteoporotic fractures',
    subGroup: 'NICE Technology Appraisal TA160',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Alendronate recommended as secondary prevention after fragility fracture. Risedronate and etidronate as alternatives if alendronate not tolerated.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'TA160 — Bisphosphonates for secondary prevention of osteoporosis', date: '2008', url: '' }
    ]
  },
  {
    id: 'nice-ta375-denosumab',
    section: 'Bone Health',
    topic: 'Denosumab for bone loss in cancer and osteoporosis',
    subGroup: 'NICE Technology Appraisal TA375',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Denosumab (Prolia) for prevention of skeletal-related events in adults with bone metastases from solid tumours, and for osteoporosis treatment where bisphosphonates are not tolerated.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    crossListedIn: ['Infection / Tumour'],
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'TA375 — Denosumab for bone loss', date: '2014', url: '' }
    ]
  },
  {
    id: 'nice-ta715-baricitinib',
    section: 'Elective',
    topic: 'Baricitinib for moderate to severe rheumatoid arthritis',
    subGroup: 'NICE Technology Appraisal TA715',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Baricitinib (Olumiant, JAK inhibitor) recommended for moderate-to-severe RA after inadequate response to ≥1 conventional DMARD. Monitoring of lipids and blood counts required.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'TA715 — Baricitinib for moderate to severe RA', date: '2021', url: '' }
    ]
  },
  {
    id: 'nice-ta559-tofacitinib',
    section: 'Elective',
    topic: 'Tofacitinib for moderate to severe rheumatoid arthritis',
    subGroup: 'NICE Technology Appraisal TA559',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Tofacitinib (Xeljanz, JAK inhibitor) recommended in combination with methotrexate for adults with moderate-to-severe active RA inadequately controlled by DMARDs.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'TA559 — Tofacitinib for RA', date: '2019', url: '' }
    ]
  },
  {
    id: 'nice-ta461-certolizumab',
    section: 'Elective',
    topic: 'Certolizumab pegol for rheumatoid arthritis',
    subGroup: 'NICE Technology Appraisal TA461',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Certolizumab pegol (Cimzia) TNF-alpha inhibitor recommended for adults with severe active RA not responding to DMARDs. Notably used in pregnancy (minimal placental transfer).',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'TA461 — Certolizumab pegol for RA', date: '2017', url: '' }
    ]
  },
  {
    id: 'nice-ta316-teriparatide',
    section: 'Bone Health',
    topic: 'Teriparatide for osteoporosis treatment',
    subGroup: 'NICE Technology Appraisal TA316',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Teriparatide (Forteo, PTH analogue) for secondary prevention of osteoporotic fractures in postmenopausal women and men with high fracture risk, particularly after previous vertebral fractures. 24-month course.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'TA316 — Teriparatide for treatment of osteoporosis', date: '2014', url: '' }
    ]
  },
  {
    id: 'nice-ta547-sarilumab',
    section: 'Elective',
    topic: 'Sarilumab for moderate to severe rheumatoid arthritis',
    subGroup: 'NICE Technology Appraisal TA547',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Sarilumab (Kevzara, IL-6 receptor inhibitor) recommended for moderate-to-severe RA not responding adequately to DMARDs. Can be used as monotherapy in patients intolerant of methotrexate.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'TA547 — Sarilumab for moderate to severe RA', date: '2018', url: '' }
    ]
  },
  {
    id: 'nice-ta195-golimumab',
    section: 'Elective',
    topic: 'Golimumab for rheumatoid arthritis and ankylosing spondylitis',
    subGroup: 'NICE Technology Appraisal TA195',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Golimumab (Simponi, TNF-alpha inhibitor) recommended for severe active RA in adults failing conventional DMARD therapy. Also indicated for ankylosing spondylitis and psoriatic arthritis.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'TA195 — Golimumab for RA and AS', date: '2010', url: '' }
    ]
  },
  {
    id: 'nice-ta409-abatacept',
    section: 'Elective',
    topic: 'Abatacept for rheumatoid arthritis',
    subGroup: 'NICE Technology Appraisal',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Abatacept (Orencia, T-cell co-stimulation inhibitor) recommended for adults with severe active RA not responding to ≥1 conventional DMARD including methotrexate, and having contraindication or failure of TNF inhibitor.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NICE TA — Abatacept for RA', url: '' }
    ]
  },
  {
    id: 'nice-ta480-tocilizumab',
    section: 'Elective',
    topic: 'Tocilizumab for rheumatoid arthritis',
    subGroup: 'NICE Technology Appraisal TA480',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Tocilizumab (RoActemra, IL-6 receptor inhibitor) for adults with severe active RA not responding to DMARDs and TNF inhibitors. Can be used as monotherapy or combined with methotrexate.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'TA480 — Tocilizumab for RA', date: '2017', url: '' }
    ]
  },
  {
    id: 'nice-ta515-secukinumab',
    section: 'Elective',
    topic: 'Secukinumab for psoriatic arthritis and ankylosing spondylitis',
    subGroup: 'NICE Technology Appraisal TA515',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Secukinumab (Cosentyx, IL-17A inhibitor) recommended for adults with active psoriatic arthritis or ankylosing spondylitis inadequately controlled by conventional therapy.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'TA515 — Secukinumab for psoriatic arthritis and AS', date: '2017', url: '' }
    ]
  },

  // ─── NICE Interventional Procedures (IPG) — 8 records ─────────────────────

  {
    id: 'nice-ipg565-vertebroplasty',
    section: 'Spine',
    topic: 'Percutaneous vertebroplasty',
    subGroup: 'NICE Interventional Procedure IPG565',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Percutaneous vertebroplasty for osteoporotic vertebral compression fractures with severe persistent pain unresponsive to conservative management. Evidence for short-term pain relief is adequate; specialist centres only.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'IPG565 — Percutaneous vertebroplasty', date: '2014', url: 'https://www.nice.org.uk/guidance/ipg565' }
    ]
  },
  {
    id: 'nice-ipg484-spinal-stimulation',
    section: 'Spine',
    topic: 'Spinal cord stimulation for chronic pain',
    subGroup: 'NICE Interventional Procedure IPG484',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Spinal cord stimulation recommended for failed back surgery syndrome and complex regional pain syndrome. Multidisciplinary assessment required. Trial stimulation before permanent implant.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    crossListedIn: ['Quick Reference'],
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'IPG484 — Spinal cord stimulation for chronic pain', date: '2008', url: '' }
    ]
  },
  {
    id: 'nice-ipg332-chondrocyte',
    section: 'Knee',
    topic: 'Autologous chondrocyte implantation',
    subGroup: 'NICE Interventional Procedure IPG332',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Autologous chondrocyte implantation (ACI) for full-thickness articular cartilage defects in the knee. Suitable for defects 2–10 cm², isolated chondral or osteochondral defects in younger active patients.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'IPG332 — Autologous chondrocyte implantation', date: '2010', url: '' }
    ]
  },
  {
    id: 'nice-ipg194-mini-thr',
    section: 'Elective',
    topic: 'Mini-incision total hip replacement',
    subGroup: 'NICE Interventional Procedure IPG194',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Mini-incision hip replacement should only be undertaken by surgeons experienced in the technique, with appropriate theatre setup. Patient selection important. No difference in clinical outcomes vs standard incision.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'IPG194 — Mini-incision total hip replacement', date: '2006', url: '' }
    ]
  },
  {
    id: 'nice-ipg230-computer-thr',
    section: 'Elective',
    topic: 'Computer-assisted hip and knee replacement',
    subGroup: 'NICE Interventional Procedure IPG230',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Computer-assisted orthopaedic surgery for hip and knee replacement is safe for use but evidence of additional benefit is not established. Adequate training required.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'IPG230 — Computer-assisted hip and knee replacement', date: '2007', url: '' }
    ]
  },
  {
    id: 'nice-ipg508-disc-replacement',
    section: 'Spine',
    topic: 'Prosthetic intervertebral disc replacement',
    subGroup: 'NICE Interventional Procedure IPG508',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Prosthetic disc replacement for lumbar disc disease in patients with persistent severe back pain not responding to conservative management. Requires specialist spine surgery team and MDT selection.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'IPG508 — Prosthetic intervertebral disc replacement', date: '2012', url: '' }
    ]
  },
  {
    id: 'nice-ipg391-bone-regeneration',
    section: 'Elective',
    topic: 'Guided bone regeneration in dental implants and jaw reconstruction',
    subGroup: 'NICE Interventional Procedure IPG391',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Guided bone regeneration using resorbable or non-resorbable membranes for bone defects in the jaw. Relevant to maxillofacial-orthopaedic crossover cases involving mandibular reconstruction.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'IPG391 — Guided bone regeneration procedures', date: '2012', url: '' }
    ]
  },
  {
    id: 'nice-ipg174-sacroiliac-rf',
    section: 'Spine',
    topic: 'Radiofrequency denervation of sacroiliac joint',
    subGroup: 'NICE Interventional Procedure IPG174',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Radiofrequency denervation of the sacroiliac joint for chronic sacroiliac pain. Current evidence is limited; only in context of clinical governance, audit, or research.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'IPG174 — Radiofrequency denervation of sacroiliac joint', date: '2006', url: '' }
    ]
  },

  // ─── NICE HealthTech / MedTech Guidance (HTG/MIB) — 7 records ─────────────

  {
    id: 'nice-htg-moxfv-knee',
    section: 'Knee',
    topic: 'MOXFV unicompartmental knee arthroplasty system',
    subGroup: 'NICE MedTech Innovation Briefing',
    source: 'NICE',
    type: 'National guidance',
    summary: 'MedTech innovation briefing for the MOXFV unicompartmental knee system. Reviews clinical evidence for patient selection, implant design, and outcomes data compared with conventional UKA.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NICE MIB — MOXFV unicompartmental knee system', url: '' }
    ]
  },
  {
    id: 'nice-htg-bone-stimulator',
    section: 'Trauma',
    topic: 'Bone healing stimulation devices',
    subGroup: 'NICE MedTech Innovation Briefing',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Review of ultrasound and electromagnetic bone healing stimulators for delayed union and non-union. Evidence suggests modest benefit in specific patient groups; not routinely recommended.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NICE MIB — Bone healing stimulation devices', url: '' }
    ]
  },
  {
    id: 'nice-htg-smart-cement',
    section: 'Elective',
    topic: 'Smart bone cement mixing systems',
    subGroup: 'NICE MedTech Innovation Briefing',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Review of closed mixing and delivery systems for bone cement in joint replacement. Evidence supports reduced cement porosity and exposure to monomer vapour, with potential improvement in cement quality.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NICE MIB — Smart cement mixing systems', url: '' }
    ]
  },
  {
    id: 'nice-htg-robotic-arthroplasty',
    section: 'Elective',
    topic: 'Robotic-assisted surgery for joint replacement',
    subGroup: 'NICE MedTech Innovation Briefing',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Review of robotic and image-guided systems for hip and knee arthroplasty. Promising accuracy for implant positioning; long-term outcome benefit not yet established. Training and cost implications significant.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NICE MIB — Robotic-assisted arthroplasty systems', url: '' }
    ]
  },
  {
    id: 'nice-htg-ankle-replace',
    section: 'Foot & Ankle',
    topic: 'Total ankle replacement systems',
    subGroup: 'NICE MedTech Guidance',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Evidence review for total ankle replacement as an alternative to ankle fusion for end-stage ankle arthritis. Appropriate patient selection (younger, active, good bone stock) key to outcomes.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NICE MTG — Total ankle replacement', url: '' }
    ]
  },
  {
    id: 'nice-htg-knee-monitor',
    section: 'Knee',
    topic: 'Remote monitoring technology for knee replacement',
    subGroup: 'NICE MedTech Innovation Briefing',
    source: 'NICE',
    type: 'National guidance',
    summary: 'MedTech review of remote monitoring and wearable sensor systems post knee replacement to support virtual rehabilitation. Emerging evidence; deployment dependent on local digital infrastructure.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NICE MIB — Remote monitoring for knee replacement', url: '' }
    ]
  },
  {
    id: 'nice-htg-vertebral-aug',
    section: 'Spine',
    topic: 'Vertebral augmentation systems',
    subGroup: 'NICE MedTech Guidance',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Review of balloon kyphoplasty and vertebral augmentation systems for osteoporotic vertebral compression fractures. Some evidence of pain reduction and height restoration; patient selection and specialist use recommended.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NICE MTG — Vertebral augmentation and kyphoplasty', url: '' }
    ]
  },

  // ─── NICE Diagnostics Guidance (DG) — 8 records ───────────────────────────

  {
    id: 'nice-dg3-bone-turnover',
    section: 'Bone Health',
    topic: 'Bone turnover markers for osteoporosis monitoring',
    subGroup: 'NICE Diagnostics Guidance DG3',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Serum CTX-1 (C-telopeptide) and P1NP (procollagen N-terminal propeptide) recommended as bone turnover markers for monitoring treatment adherence and response in osteoporosis. Baseline and 3-month measurements.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'DG3 — Bone turnover markers: serum CTX-1 and P1NP', date: '2013', url: 'https://www.nice.org.uk/guidance/dg3' }
    ]
  },
  {
    id: 'nice-dg-dxa-scanning',
    section: 'Bone Health',
    topic: 'DXA scanning for bone mineral density assessment',
    subGroup: 'NICE Diagnostics Guidance',
    source: 'NICE',
    type: 'National guidance',
    summary: 'DXA recommended for assessment of bone mineral density in patients identified at risk by FRAX, in those starting high-dose steroids, and post-fragility fracture. Standard for T-score reporting per WHO criteria.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NICE DG — DXA for bone mineral density', url: '' }
    ]
  },
  {
    id: 'nice-dg-poc-mrsa',
    section: 'Infection / Tumour',
    topic: 'Point-of-care MRSA testing',
    subGroup: 'NICE Diagnostics Guidance',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Rapid MRSA screening at admission for patients undergoing elective orthopaedic surgery. Point-of-care PCR testing allows same-day decolonisation to proceed. Reduces need for isolation facilities.',
    regionalVariation: false,
    localOverlayNeeded: true,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NICE DG — Point-of-care MRSA testing', url: '' }
    ]
  },
  {
    id: 'nice-dg-hip-fracture-ai',
    section: 'Trauma',
    topic: 'AI-assisted hip fracture detection on X-ray',
    subGroup: 'NICE Diagnostics Guidance',
    source: 'NICE',
    type: 'National guidance',
    summary: 'AI image analysis tools for detection of hip fractures on plain radiographs. Supports radiologist workflow in ED and on-call settings. Evidence supports sensitivity and specificity comparable to radiologist review for clear fracture patterns.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NICE DG — AI-assisted hip fracture detection', url: '' }
    ]
  },
  {
    id: 'nice-dg-mri-lbp',
    section: 'Spine',
    topic: 'MRI protocols for low back pain and radiculopathy',
    subGroup: 'NICE Diagnostics Guidance',
    source: 'NICE',
    type: 'National guidance',
    summary: 'MRI protocol guidance for back pain and radiculopathy. Whole spine MRI for suspected malignancy, infection, or CES. Targeted lumbar/cervical MRI for radiculopathy not improving at 4–6 weeks.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NICE DG — MRI for back pain and radiculopathy', url: '' }
    ]
  },
  {
    id: 'nice-dg-pjoint-aspirate',
    section: 'Infection / Tumour',
    topic: 'Joint aspiration and synovial fluid analysis for suspected septic arthritis',
    subGroup: 'NICE Diagnostics Guidance',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Joint aspiration prior to antibiotic therapy in suspected septic arthritis. WCC >50,000/mm³ is strongly suggestive of infection. Gram stain, culture and sensitivity, and crystal microscopy on all samples.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NICE DG — Joint aspiration for septic arthritis diagnosis', url: '' }
    ]
  },
  {
    id: 'nice-dg-surgical-site-inf',
    section: 'Infection / Tumour',
    topic: 'Diagnosis and management of surgical site infection',
    subGroup: 'NICE Diagnostics Guidance',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Diagnosis of SSI based on clinical criteria: erythema, purulent discharge, dehiscence. Wound swab culture for antibiotic guidance. Imaging (US, CT, MRI) for deep SSI. Management: debridement, washout, targeted antibiotics.',
    regionalVariation: false,
    localOverlayNeeded: true,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NICE DG — Surgical site infection diagnosis', url: '' }
    ]
  },
  {
    id: 'nice-dg-crp-esa',
    section: 'Quick Reference',
    topic: 'Inflammatory markers in musculoskeletal infection and inflammatory arthritis',
    subGroup: 'NICE Diagnostics Guidance',
    source: 'NICE',
    type: 'National guidance',
    summary: 'Role of CRP, ESR, WCC, and procalcitonin in diagnosing and monitoring musculoskeletal infections (osteomyelitis, septic arthritis, PJI) and inflammatory arthritis. Serial monitoring recommended for treatment response.',
    regionalVariation: false,
    localOverlayNeeded: false,
    lastChecked: '2025-01-01',
    status: 'Live',
    priority: 'low',
    sourceAccessStatus: 'accessible',
    versions: [
      { label: 'NICE DG — Inflammatory markers in MSK infection', url: '' }
    ]
  },

  // ─── Flagged sources (3) ───────────────────────────────────────────────────

  {
    id: 'bask-flagged',
    section: 'Knee',
    topic: 'BASK guidelines (access blocked)',
    subGroup: 'Cloudflare block',
    source: 'BASK',
    type: 'Specialist society guidance',
    summary: 'British Association for Surgery of the Knee (BASK) publishes clinical guidelines and consensus documents on knee conditions including ACL, meniscus, articular cartilage, and arthroplasty. Access was blocked by Cloudflare at time of last check.',
    regionalVariation: false,
    localOverlayNeeded: false,
    notes: 'Source blocked by Cloudflare. Retry directly at www.bask.org.uk.',
    lastChecked: '2026-01-01',
    status: 'Flagged',
    priority: 'low',
    sourceAccessStatus: 'broken',
    versions: []
  },
  {
    id: 'bois-flagged',
    section: 'Quick Reference',
    topic: 'BOIS guidelines (site error)',
    subGroup: 'Site error',
    source: 'BOIS',
    type: 'Specialist society guidance',
    summary: 'British Orthopaedic Imaging Society (BOIS) produces guidance on imaging in orthopaedic practice. Site returned an error at last check. Guidance covers appropriate use of X-ray, CT, MRI, and ultrasound in orthopaedics.',
    regionalVariation: false,
    localOverlayNeeded: false,
    notes: 'Site returning error. Retry at BOIS website or contact society directly.',
    lastChecked: '2026-01-01',
    status: 'Flagged',
    priority: 'low',
    sourceAccessStatus: 'broken',
    versions: []
  },
  {
    id: 'bscos-flagged',
    section: 'Paediatrics',
    topic: 'BSCOS guidelines (login required)',
    subGroup: 'Login required',
    source: 'BSCOS',
    type: 'Specialist society guidance',
    summary: 'British Society for Children\'s Orthopaedic Surgery (BSCOS) guidelines on paediatric orthopaedic conditions. Content is behind a member login. Covers developmental dysplasia of the hip, clubfoot, Perthes disease, scoliosis, and paediatric trauma.',
    regionalVariation: false,
    localOverlayNeeded: false,
    notes: 'Login required at BSCOS member portal. Requires BSCOS membership.',
    lastChecked: '2026-01-01',
    status: 'Flagged',
    priority: 'low',
    sourceAccessStatus: 'login-required',
    versions: []
  },

];
