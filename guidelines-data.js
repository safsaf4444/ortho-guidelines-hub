/**
 * Orthopaedic Guidelines Hub - Data Schema and Seed Data
 * 
 * Schema Definition:
 * - id: String (unique identifier)
 * - section: String (Top-level clinical section, e.g., 'Emergencies', 'Trauma')
 * - topic: String (The clinical topic that forms the main expandable card, e.g., 'Cauda equina syndrome')
 * - subGroup: String (Optional, for nested grouping within a topic card, e.g., 'Red flags' vs 'Acute presentation')
 * - source: String (Provider, e.g., 'BOASt', 'NICE', 'GIRFT')
 * - type: String (e.g., 'National guidance', 'Specialist society guidance', 'Quick reference')
 * - summary: String (TL;DR clinical summary)
 * - regionalVariation: Boolean (Flag for potential local trust variation)
 * - localOverlayNeeded: Boolean (Flag indicating if local hospital policy should overlay this)
 * - notes: String (Clinical caveats or nuances)
 * - status: String (e.g., 'Linked', 'To source', 'Drafted')
 * - versions: Array of Objects { label, date, url, pdfUrl (optional), screenshotUrl (optional) }
 */

const GUIDELINES_DATA = [
    // ---------------------------------------------
    // EMERGENCIES (Always pinned top)
    // ---------------------------------------------
    {
        id: 'ces-acute-girft',
        section: 'Emergencies',
        topic: 'Cauda equina syndrome',
        subGroup: 'Acute presentation',
        source: 'GIRFT',
        type: 'National guidance',
        summary: 'National suspected Cauda Equina pathway. Emphasises immediate MRI within 4 hours for suspected cases.',
        regionalVariation: true,
        localOverlayNeeded: true,
        notes: 'Preserving both versions as requested. March 2026 pathway updates referral criteria.',
        status: 'Linked',
        versions: [
            { label: 'March 2026 update', date: 'Mar 2026', url: 'https://gettingitrightfirsttime.co.uk/wp-content/uploads/2026/04/National-Suspected-Cauda-Equina-Pathway-March-2026.pdf' },
            { label: 'Version 3 (Archived)', date: 'Oct 2023', url: 'https://gettingitrightfirsttime.co.uk/wp-content/uploads/2023/10/CES-pathway-v3.pdf' }
        ]
    },
    {
        id: 'compartment-syndrome-boast',
        section: 'Emergencies',
        topic: 'Acute compartment syndrome',
        source: 'BOASt',
        type: 'National guidance',
        summary: 'Clinical diagnosis. Do not wait for pressure monitoring if clinically obvious. Avoid regional anaesthesia in high-risk patients.',
        regionalVariation: false,
        localOverlayNeeded: false,
        notes: 'Fasciotomy must decompress all four compartments in the lower leg.',
        status: 'Linked',
        versions: [
            { label: 'BOASt 10 (current)', date: '2025', url: 'https://www.boa.ac.uk/resource/boast-10-pdf.html' }
        ]
    },
    {
        id: 'open-fractures-boast',
        section: 'Emergencies',
        topic: 'Open fractures',
        source: 'BOASt',
        type: 'National guidance',
        summary: 'IV antibiotics within 1 hour. Photographic documentation before covering with saline-soaked gauze. Joint plastic/ortho approach.',
        regionalVariation: true,
        localOverlayNeeded: true,
        notes: 'Co-badged with BAPRAS.',
        status: 'Linked',
        versions: [
            { label: 'BOASt 4', date: 'Current', url: 'https://www.boa.ac.uk/resource/boast-4-pdf.html' }
        ]
    },

    // ---------------------------------------------
    // TRAUMA
    // ---------------------------------------------
    {
        id: 'supracondylar-boast',
        section: 'Trauma',
        topic: 'Supracondylar fractures',
        subGroup: 'Paediatric trauma',
        source: 'BOASt',
        type: 'National guidance',
        summary: 'Assess pulseless pink vs pulseless pale hand. Fixation with 2 or 3 crossed/divergent K-wires.',
        regionalVariation: false,
        localOverlayNeeded: false,
        notes: 'Urgent surgery if pulseless pale.',
        status: 'Linked',
        versions: [
            { label: 'BOASt 11', date: 'Current', url: 'https://www.boa.ac.uk/resource/boast-11-pdf.html' }
        ]
    },
    {
        id: 'ankle-fractures-boast',
        section: 'Trauma',
        topic: 'Ankle fractures',
        source: 'BOASt',
        type: 'National guidance',
        summary: 'Weight-bearing in a cast/boot as soon as tolerated post-op. VTE assessment mandatory.',
        regionalVariation: false,
        localOverlayNeeded: true,
        notes: 'High incidence of variation in VTE protocols locally.',
        status: 'Linked',
        versions: [
            { label: 'BOASt 12', date: 'Current', url: 'https://www.boa.ac.uk/resource/boast-12-pdf.html' }
        ]
    },
    {
        id: 'tibial-plateau-bofas',
        section: 'Trauma',
        topic: 'Tibial plateau fracture',
        source: 'BOFAS',
        type: 'Specialist society guidance',
        summary: 'Initial spanning external fixation for high energy injuries. Wait for soft tissues to settle.',
        regionalVariation: false,
        localOverlayNeeded: false,
        notes: 'Pending final source URL.',
        status: 'To source',
        versions: [
            { label: 'Guidelines', date: 'Current', url: '#' }
        ]
    },

    // ---------------------------------------------
    // ELECTIVE & KNEE
    // ---------------------------------------------
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
        status: 'Linked',
        versions: [
            { label: 'EBI Guidance', date: 'Current', url: 'https://ebi.aomrc.org.uk/interventions/knee-arthroscopy-for-patients-with-osteoarthritis/' }
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
        status: 'Linked',
        versions: [
            { label: 'Ambulatory Guide', date: 'Mar 2023', url: 'https://gettingitrightfirsttime.co.uk/wp-content/uploads/2023/07/Ambulatory-Hip-and-Knee-Replacement-Guide-March-2023-FINAL-V1-1.pdf' }
        ]
    },

    // ---------------------------------------------
    // SPINE
    // ---------------------------------------------
    {
        id: 'ces-red-flags-spine',
        section: 'Spine',
        topic: 'Cauda equina syndrome',
        subGroup: 'Red flags',
        source: 'NICE',
        type: 'NICE guideline',
        summary: 'Bilateral sciatica, saddle anaesthesia, bladder/bowel dysfunction require urgent evaluation.',
        regionalVariation: false,
        localOverlayNeeded: false,
        notes: 'This demonstrates cross-listing. Note the topic matches the Emergencies card.',
        status: 'Linked',
        versions: [
            { label: 'NG59', date: '2020', url: 'https://www.nice.org.uk/guidance/ng59' }
        ]
    },

    // ---------------------------------------------
    // QUICK REFERENCE
    // ---------------------------------------------
    {
        id: 'qr-asa-grades',
        section: 'Quick Reference',
        topic: 'ASA Grades',
        source: 'Quick Ref',
        type: 'Quick reference',
        summary: 'I: Normal healthy patient\nII: Mild systemic disease\nIII: Severe systemic disease\nIV: Severe systemic disease that is a constant threat to life\nV: Moribund patient not expected to survive without operation',
        regionalVariation: false,
        localOverlayNeeded: false,
        notes: '',
        status: 'Linked',
        versions: []
    }
];

// In a real app we'd export this. For a plain HTML file, it will just sit in the global scope.
window.GUIDELINES_DATA = GUIDELINES_DATA;
