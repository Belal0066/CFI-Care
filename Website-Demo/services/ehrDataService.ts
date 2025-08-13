
import { Patient, EventNodeData, EventType, EventStatus, MedicalEpisode, VitalSign, VitalSignDataPoint, DependencyGraphData, DependencyNodeType, DependencyEdgeType } from '../types';

export const getPatientData = (): Patient => ({
  id: 'pat-001',
  name: 'John Appleseed',
  dateOfBirth: '1985-05-20',
  bloodType: 'O+',
  maritalStatus: 'Married',
  occupation: 'Software Engineer',
  address: '123 Main St\nAnytown, USA 12345',
  socialHistory: [
    'Non-smoker',
    'Occasional alcohol use',
    'Lives in a 2-story walk-up apartment (relevant for knee surgery recovery)',
  ],
  allergies: ['Penicillin', 'Peanuts'],
  conflicts: [
    {
      id: 'conf-001',
      field: 'allergies',
      key: 'Aspirin',
      existingValue: 'No known allergy to Aspirin.',
      newValue: 'Patient reports mild rash with Aspirin.',
      sources: {
        existing: 'Dr. Smith, Annual Physical, 2023.',
        new: 'Nurse Davis, Pre-procedure Intake, 2025.',
      },
      status: 'unresolved',
    }
  ],
  geneticConditions: ['None Reported'],
  chronicMedications: ['Lisinopril (for Hypertension)'],
  activeDevices: ['Wearable Health Monitor (ECG, SPO2)'],
});

const now = new Date();
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

export const getVitalsData = (): VitalSign[] => {
  const generateData = (base: number, fluctuation: number, count: number): VitalSignDataPoint[] => {
    const data: VitalSignDataPoint[] = [];
    const today = new Date();
    for (let i = 0; i < count; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() - (count - 1 - i));
      data.push({
        timestamp: date,
        value: base + (Math.random() - 0.5) * fluctuation,
      });
    }
    return data;
  };

  return [
    {
      name: 'Heart Rate',
      unit: 'bpm',
      data: generateData(72, 8, 30).map(d => ({ ...d, value: Math.round(d.value) })),
    },
    {
      name: 'Systolic BP',
      unit: 'mmHg',
      data: generateData(120, 10, 30).map(d => ({ ...d, value: Math.round(d.value) })),
    },
    {
      name: 'Diastolic BP',
      unit: 'mmHg',
      data: generateData(80, 5, 30).map(d => ({ ...d, value: Math.round(d.value) })),
    },
    {
      name: 'Respiratory Rate',
      unit: 'breaths/min',
      data: generateData(16, 4, 30).map(d => ({ ...d, value: Math.round(d.value) })),
    },
    {
      name: 'Temperature',
      unit: '°F',
      data: generateData(98.6, 1.2, 30).map(d => ({ ...d, value: parseFloat(d.value.toFixed(1)) })),
    },
    {
      name: 'SPO2',
      unit: '%',
      data: generateData(98, 2, 30).map(d => ({ ...d, value: Math.max(95, Math.min(100, Math.round(d.value))) })),
    },
  ];
};

const cardiacWorkupEvents: EventNodeData[] = [
    {
      id: 'evt-c01',
      parentIds: [],
      timestamp: daysAgo(70),
      type: EventType.HPI,
      summary: 'HPI: Exertional Chest Pain',
      details: '{"symptoms":["Exertional chest pain leading to referral for cardiac workup."],"signs":["An unresolved data conflict regarding Aspirin allergy was noted during intake."]}',
      author: 'Dr. Carter',
      status: EventStatus.ACTIVE,
      specialty: 'Cardiology',
      isMajorEvent: true,
    },
    {
      id: 'evt-c03',
      parentIds: ['evt-c01'],
      timestamp: daysAgo(68),
      type: EventType.INVESTIGATION,
      summary: 'EKG performed in-office.',
      details: 'EKG shows non-specific ST-T wave changes. No acute ischemia.',
      author: 'Dr. Carter',
      status: EventStatus.COMPLETED,
      specialty: 'Cardiology',
      isMajorEvent: false,
    },
    {
      id: 'evt-c04',
      parentIds: ['evt-c03'],
      timestamp: daysAgo(67),
      type: EventType.DIAGNOSIS,
      summary: 'Differential Diagnosis: Stable Angina vs. GERD vs. Anxiety.',
      details: 'Based on symptoms and initial EKG, need to rule out cardiac, GI, and psychological causes. This is the branch point for the workup.',
      author: 'Dr. Carter',
      status: EventStatus.ACTIVE,
      specialty: 'General Practice',
      isMajorEvent: false,
    },
    // Branch A: Gastroenterology Workup
    {
      id: 'evt-c05a',
      parentIds: ['evt-c04'],
      timestamp: daysAgo(65),
      type: EventType.MEDICATION,
      summary: 'Trial of PPI medication.',
      details: 'Omeprazole 40mg daily prescribed to rule out GERD as the cause of chest pain.',
      author: 'Dr. Carter',
      status: EventStatus.COMPLETED,
      specialty: 'Gastroenterology',
      isMajorEvent: false,
    },
    {
      id: 'evt-c06a',
      parentIds: ['evt-c05a'],
      timestamp: daysAgo(60),
      type: EventType.OBSERVATION,
      summary: 'Result: No improvement in symptoms.',
      details: 'Patient reports no change in chest pain symptoms after 1 week of PPI therapy. GERD is less likely.',
      author: 'Nurse Johnson',
      status: EventStatus.RESOLVED,
      specialty: 'Gastroenterology',
      isMajorEvent: false,
    },
    // Branch B: Cardiology Workup (now with more branching)
    {
      id: 'evt-c05b',
      parentIds: ['evt-c04'],
      timestamp: daysAgo(66),
      type: EventType.INVESTIGATION,
      summary: 'Cardiology Referral & Multi-modal Workup',
      details: 'Patient referred to cardiology for a comprehensive workup involving multiple parallel investigations to assess coronary artery status.',
      author: 'Dr. Carter',
      status: EventStatus.COMPLETED,
      specialty: 'Cardiology',
      isMajorEvent: false,
    },
    // Branch B1: Stress Test
    {
      id: 'evt-inv-1',
      parentIds: ['evt-c05b'],
      timestamp: daysAgo(64),
      type: EventType.INVESTIGATION,
      summary: 'Stress Test Result: Positive',
      details: 'Stress test was positive for significant ischemia in the anterior distribution.',
      author: 'Dr. Ortiz',
      status: EventStatus.COMPLETED,
      specialty: 'Cardiology',
      isMajorEvent: false
    },
    // Branch B2: Echocardiogram (with its own branch and merge)
    {
      id: 'evt-inv-2',
      parentIds: ['evt-c05b'],
      timestamp: daysAgo(63),
      type: EventType.INVESTIGATION,
      summary: 'Echocardiogram: Wall Motion Abnormality',
      details: 'Initial echo reading suggests potential wall motion abnormalities. Requires further review.',
      author: 'Tech',
      status: EventStatus.ACTIVE,
      specialty: 'Radiology',
      isMajorEvent: false
    },
    {
      id: 'evt-inv-2-followup',
      parentIds: ['evt-inv-2'],
      timestamp: daysAgo(61),
      type: EventType.FOLLOW_UP,
      summary: 'Cardiologist Review of Echo',
      details: 'Dr. Ortiz reviewed echo images and concurs with initial findings.',
      author: 'Dr. Ortiz',
      status: EventStatus.COMPLETED,
      specialty: 'Cardiology',
      isMajorEvent: false
    },
    {
      id: 'evt-inv-2-consult',
      parentIds: ['evt-inv-2'],
      timestamp: daysAgo(60),
      type: EventType.OBSERVATION,
      summary: 'Imaging Specialist Second Opinion',
      details: 'Specialist confirms wall motion abnormality corresponds to LAD territory.',
      author: 'Dr. Ray',
      status: EventStatus.COMPLETED,
      specialty: 'Radiology',
      isMajorEvent: false
    },
    {
      id: 'evt-inv-2-merge',
      parentIds: ['evt-inv-2-followup', 'evt-inv-2-consult'],
      timestamp: daysAgo(59),
      type: EventType.DIAGNOSIS,
      summary: 'Consolidated Echo Report',
      details: 'Final, confirmed report: Hypokinesis of the anterior wall, consistent with ischemia.',
      author: 'Dr. Ortiz',
      status: EventStatus.RESOLVED,
      specialty: 'Cardiology',
      isMajorEvent: false
    },
    // Branch B3: CCTA
    {
      id: 'evt-inv-3',
      parentIds: ['evt-c05b'],
      timestamp: daysAgo(62),
      type: EventType.INVESTIGATION,
      summary: 'CCTA Result: Significant Stenosis',
      details: 'Coronary CT Angiography reveals an 80% stenosis in the left anterior descending (LAD) artery.',
      author: 'Dr. Ray',
      status: EventStatus.COMPLETED,
      specialty: 'Radiology',
      isMajorEvent: false
    },
    // The Big Merge: Diagnosis based on all investigations
    {
      id: 'evt-c06b',
      parentIds: ['evt-inv-1', 'evt-inv-2-merge', 'evt-inv-3'],
      timestamp: daysAgo(55),
      type: EventType.DIAGNOSIS,
      summary: 'Diagnosis: CAD Confirmed via Triangulation',
      details: 'Diagnosis of severe Coronary Artery Disease confirmed by triangulating results from Stress Test, Echocardiogram, and CCTA.',
      author: 'Dr. Ortiz',
      status: EventStatus.ACTIVE,
      specialty: 'Cardiology',
      isMajorEvent: true,
    },
    // Merge of GERD and Cardiac paths leading to procedure
    {
      id: 'evt-c07',
      parentIds: ['evt-c06a', 'evt-c06b'], 
      timestamp: daysAgo(54),
      type: EventType.PROCEDURE,
      summary: 'Procedure: Angioplasty with stent.',
      details: 'Successful percutaneous coronary intervention (PCI) of the left anterior descending (LAD) artery with placement of a drug-eluting stent. The diagnostic paths converge here.',
      author: 'Dr. Ortiz',
      status: EventStatus.COMPLETED,
      specialty: 'Cardiology',
      isMajorEvent: true,
    },
    // Remainder of timeline
    {
      id: 'evt-c08',
      parentIds: ['evt-c07'], 
      timestamp: daysAgo(53),
      type: EventType.MEDICATION,
      summary: 'Prescription: Plavix & Aspirin Review',
      details: 'Patient started on Plavix 75mg daily. Aspirin held pending allergy resolution.',
      author: 'Dr. Ortiz',
      status: EventStatus.CONFLICT,
      specialty: 'Pharmacy',
      isMajorEvent: false,
    },
    {
        id: 'evt-c09',
        parentIds: ['evt-c07'], 
        timestamp: daysAgo(52),
        type: EventType.HPI,
        summary: 'HPI: Post-procedure groin pain & swelling',
        details: '{"symptoms":["Patient reports moderate pain at the catheter insertion site."],"signs":["Visible swelling at the catheter insertion site."]}',
        author: 'Nurse R. Davis',
        status: EventStatus.ACTIVE,
        specialty: 'Nursing',
        isMajorEvent: false,
    },
    {
        id: 'evt-c10a',
        parentIds: ['evt-c09'],
        timestamp: daysAgo(51),
        type: EventType.INVESTIGATION,
        summary: 'Ultrasound of groin ordered.',
        details: 'STAT ultrasound to rule out pseudoaneurysm or significant hematoma.',
        author: 'Dr. Ortiz',
        status: EventStatus.COMPLETED,
        specialty: 'Radiology',
        isMajorEvent: false,
    },
    {
        id: 'evt-c11a',
        parentIds: ['evt-c10a'],
        timestamp: daysAgo(50),
        type: EventType.DIAGNOSIS,
        summary: 'Diagnosis: Groin Hematoma (non-expanding)',
        details: 'Ultrasound confirms a 4cm hematoma without active bleeding. Vascular surgery consulted.',
        author: 'Dr. Webb (Vascular)',
        status: EventStatus.ACTIVE,
        specialty: 'Vascular Surgery',
        isMajorEvent: false,
    },
    {
        id: 'evt-c12a',
        parentIds: ['evt-c11a'],
        timestamp: daysAgo(49),
        type: EventType.PROCEDURE,
        summary: 'Conservative management initiated.',
        details: 'Plan is for watchful waiting, pressure dressing, and serial checks.',
        author: 'Dr. Webb (Vascular)',
        status: EventStatus.COMPLETED,
        specialty: 'Vascular Surgery',
        isMajorEvent: false,
    },
    {
        id: 'evt-c10b',
        parentIds: ['evt-c08'],
        timestamp: daysAgo(45),
        type: EventType.FOLLOW_UP,
        summary: 'Routine post-PCI follow-up call.',
        details: 'Cardiology nurse call to check on patient status and medication adherence.',
        author: 'Nurse Johnson',
        status: EventStatus.COMPLETED,
        specialty: 'Cardiology',
        isMajorEvent: false,
    },
    {
        id: 'evt-c11b',
        parentIds: ['evt-c10b'],
        timestamp: daysAgo(45),
        type: EventType.OBSERVATION,
        summary: 'Patient confirms chest pain resolved.',
        details: 'Patient reports no further chest pain. Still has groin soreness but improving. Tolerating Plavix well.',
        author: 'Nurse Johnson',
        status: EventStatus.RESOLVED,
        specialty: 'Cardiology',
        isMajorEvent: false,
    },
    {
        id: 'evt-c13',
        parentIds: ['evt-c12a', 'evt-c11b'],
        timestamp: daysAgo(40),
        type: EventType.FOLLOW_UP,
        summary: 'Follow-up: Patient stable, issues resolved.',
        details: 'Patient seen in clinic. Chest pain remains resolved. Groin hematoma is nearly gone. Cleared to resume normal activities.',
        author: 'Dr. Ortiz',
        status: EventStatus.RESOLVED,
        specialty: 'Cardiology',
        isMajorEvent: false,
    },
];

const pneumoniaEvents: EventNodeData[] = [
    {
      id: 'evt-001',
      parentIds: [],
      timestamp: daysAgo(30),
      type: EventType.HPI,
      summary: 'HPI: Persistent cough and fatigue',
      details: '{"symptoms":["Cough is dry, has lasted for 2 weeks.","Fatigue is moderate."],"signs":[]}',
      author: 'Dr. Emily Carter',
      status: EventStatus.ACTIVE,
      specialty: 'General Practice',
      isMajorEvent: true,
    },
    {
      id: 'evt-002',
      parentIds: ['evt-001'],
      timestamp: daysAgo(29),
      type: EventType.INVESTIGATION,
      summary: 'Chest X-Ray ordered.',
      details: 'To rule out pneumonia or other lung conditions.',
      author: 'Dr. Emily Carter',
      status: EventStatus.COMPLETED,
      specialty: 'Radiology',
      isMajorEvent: false,
    },
    {
      id: 'evt-003',
      parentIds: ['evt-002'],
      timestamp: daysAgo(28),
      type: EventType.DIAGNOSIS,
      summary: 'Initial Diagnosis: Bronchitis.',
      details: 'X-Ray clear, symptoms consistent with acute bronchitis.',
      author: 'Dr. Emily Carter',
      status: EventStatus.ACTIVE,
      specialty: 'General Practice',
      isMajorEvent: false,
    },
    {
      id: 'evt-004a',
      parentIds: ['evt-003'],
      timestamp: daysAgo(27),
      type: EventType.MEDICATION,
      summary: 'Prescribed Amoxicillin.',
      details: 'Standard antibiotic course for suspected bacterial bronchitis.',
      author: 'Dr. Emily Carter',
      status: EventStatus.ACTIVE,
      specialty: 'Pharmacy',
      isMajorEvent: false,
      diff: { before: 'No antibiotic treatment.', after: 'Amoxicillin 500mg, 3 times daily for 7 days.' },
    },
    {
      id: 'evt-004b',
      parentIds: ['evt-003'],
      timestamp: daysAgo(24),
      type: EventType.HPI,
      summary: 'HPI: Symptoms worsened, rash appeared',
      details: '{"symptoms":["Increased coughing","Reports fever"],"signs":["New skin rash."]}',
      author: 'Nurse Johnson',
      status: EventStatus.ACTIVE,
      specialty: 'Nursing',
      isMajorEvent: false,
    },
    {
      id: 'evt-005b',
      parentIds: ['evt-004b'],
      timestamp: daysAgo(23),
      type: EventType.DIAGNOSIS,
      summary: 'Differential Diagnosis: Atypical Pneumonia vs. Drug Reaction.',
      details: 'Worsening condition suggests initial diagnosis may be incomplete or incorrect. Rash could be an adverse reaction to Amoxicillin.',
      author: 'Dr. Emily Carter',
      status: EventStatus.ACTIVE,
      specialty: 'General Practice',
      isMajorEvent: false,
    },
    {
      id: 'evt-006b',
      parentIds: ['evt-005b'],
      timestamp: daysAgo(22),
      type: EventType.ADVERSE_EVENT,
      summary: 'Adverse Drug Reaction to Amoxicillin confirmed.',
      details: 'Rash identified as an allergic reaction to penicillin-class antibiotics.',
      author: 'Dr. Benfield',
      status: EventStatus.RESOLVED,
      specialty: 'Allergy & Immunology',
      isMajorEvent: false,
    },
    {
      id: 'evt-007',
      parentIds: ['evt-004a', 'evt-006b'],
      timestamp: daysAgo(21),
      type: EventType.DIAGNOSIS,
      summary: 'Final Diagnosis: Mycoplasma Pneumonia.',
      details: 'Amoxicillin stopped. Based on the persistent cough and confirmed drug allergy, Atypical Pneumonia is the most likely diagnosis. Further tests confirm Mycoplasma.',
      author: 'Dr. Emily Carter',
      status: EventStatus.ACTIVE,
      specialty: 'Infectious Disease',
      isMajorEvent: false,
    },
    {
      id: 'evt-008',
      parentIds: ['evt-007'],
      timestamp: daysAgo(20),
      type: EventType.MEDICATION,
      summary: 'Prescribed Azithromycin.',
      details: 'Changed antibiotic to Azithromycin which is effective against Atypical Pneumonia.',
      author: 'Dr. Emily Carter',
      status: EventStatus.ACTIVE,
      specialty: 'Pharmacy',
      isMajorEvent: false,
      diff: { before: 'Amoxicillin 500mg.', after: 'Azithromycin 500mg daily for 5 days.' },
    },
    {
      id: 'evt-009',
      parentIds: ['evt-008'],
      timestamp: daysAgo(10),
      type: EventType.FOLLOW_UP,
      summary: 'Patient condition improved significantly.',
      details: 'Cough has subsided, fatigue is gone. Treatment successful.',
      author: 'Dr. Emily Carter',
      status: EventStatus.RESOLVED,
      specialty: 'General Practice',
      isMajorEvent: false,
    },
];

const kneeSurgeryEvents: EventNodeData[] = [
    {
      id: 'evt-010',
      parentIds: [],
      timestamp: daysAgo(2),
      type: EventType.HOSPITALIZATION,
      summary: 'Scheduled for knee surgery (unrelated).',
      details: 'Pre-operative assessment for elective arthroscopic surgery on the right knee.',
      author: 'Dr. Ortiz',
      status: EventStatus.PLANNED,
      specialty: 'Orthopedics',
      isMajorEvent: true,
    }
];


export const getEhrHistory = (): MedicalEpisode[] => {
  const episodes: MedicalEpisode[] = [
    {
      id: 'ep-001',
      title: 'Cardiac Workup',
      status: EventStatus.CONFLICT,
      dateRange: '8/10/2025 - Present',
      events: cardiacWorkupEvents,
    },
    {
      id: 'ep-002',
      title: 'Mycoplasma Pneumonia',
      status: EventStatus.RESOLVED,
      dateRange: '9/15/2025 - 10/05/2025',
      events: pneumoniaEvents,
    },
    {
      id: 'ep-003',
      title: 'Knee Surgery Prep',
      status: EventStatus.PLANNED,
      dateRange: '10/13/2025 - Ongoing',
      events: kneeSurgeryEvents,
    },
  ];

  return episodes;
};

export const getDependencyGraphData = (): DependencyGraphData => ({
  clusters: [
    { id: 'c-symptom', label: 'Symptoms' },
    { id: 'c-exam', label: 'Physical Exam' },
    { id: 'c-diag', label: 'Potential Diagnoses' },
    { id: 'c-imaging', label: 'Imaging Results' },
    { id: 'c-op', label: 'Operative Findings' },
    { id: 'c-treat', label: 'Treatments' },
    { id: 'c-outcome', label: 'Outcome' }
  ],
  nodes: [
    // T0: Initial Presentation
    { id: 'n-symptom-pain', label: 'Left anterior chest wall pain', type: DependencyNodeType.SYMPTOM, author: 'Dr. Adams (ER)', timestamp: daysAgo(10), clusterId: 'c-symptom', eventIds: [], details: 'Patient reports sharp pain after blunt trauma.'},
    { id: 'n-exam-breath', label: 'Decreased breath sounds (left thorax)', type: DependencyNodeType.PHYSICAL_EXAM, author: 'Dr. Adams (ER)', timestamp: daysAgo(10), clusterId: 'c-exam', eventIds: [] },
    { id: 'n-exam-bowel', label: 'Bowel sounds heard in thorax', type: DependencyNodeType.PHYSICAL_EXAM, author: 'Dr. Adams (ER)', timestamp: daysAgo(10), clusterId: 'c-exam', eventIds: [], details: 'A key, pathognomonic finding.' },
    { id: 'n-diag-rupture', label: 'Diaphragmatic Rupture', type: DependencyNodeType.DIAGNOSIS, author: 'Dr. Adams (ER)', timestamp: daysAgo(10), clusterId: 'c-diag', eventIds: [], details: 'High suspicion based on exam.' },
    { id: 'n-diag-ribs', label: 'Rib Fractures', type: DependencyNodeType.DIAGNOSIS, author: 'Dr. Adams (ER)', timestamp: daysAgo(10), clusterId: 'c-diag', eventIds: [] },
    { id: 'n-diag-lung', label: 'Lung Injury', type: DependencyNodeType.DIAGNOSIS, author: 'Dr. Adams (ER)', timestamp: daysAgo(10), clusterId: 'c-diag', eventIds: [] },

    // T1: Imaging Findings
    { id: 'n-img-cxr', label: 'CXR: Rib fractures, hemothorax, bowel in thorax', type: DependencyNodeType.INVESTIGATION, author: 'Dr. Bell (Radiology)', timestamp: daysAgo(8), clusterId: 'c-imaging', eventIds: [] },
    { id: 'n-img-pelvis', label: 'Pelvis X-ray: Unremarkable', type: DependencyNodeType.INVESTIGATION, author: 'Dr. Bell (Radiology)', timestamp: daysAgo(8), clusterId: 'c-imaging', eventIds: [] },

    // T2: Surgical Findings
    { id: 'n-op-spleen', label: 'Splenic laceration (inferior pole)', type: DependencyNodeType.SIDE_EFFECT, author: 'Dr. Chen (Surgery)', timestamp: daysAgo(5), clusterId: 'c-op', eventIds: [], details: 'An associated injury discovered during surgery.' },

    // T3: Interventions & Outcomes
    { id: 'n-treat-laparotomy', label: 'Emergency Laparotomy', type: DependencyNodeType.TREATMENT, author: 'Dr. Chen (Surgery)', timestamp: daysAgo(2), clusterId: 'c-treat', eventIds: [] },
    { id: 'n-treat-repair', label: 'Repair diaphragmatic defect', type: DependencyNodeType.TREATMENT, author: 'Dr. Chen (Surgery)', timestamp: daysAgo(2), clusterId: 'c-treat', eventIds: [] },
    { id: 'n-treat-splenectomy', label: 'Splenectomy', type: DependencyNodeType.TREATMENT, author: 'Dr. Chen (Surgery)', timestamp: daysAgo(2), clusterId: 'c-treat', eventIds: [] },
    { id: 'n-outcome-recovery', label: 'Full Recovery', type: DependencyNodeType.OUTCOME, author: 'Dr. Chen (Surgery)', timestamp: daysAgo(1), clusterId: 'c-outcome', eventIds: [] },
  ],
  edges: [
    // T0 Edges
    { id: 'e1', source: 'n-symptom-pain', target: 'n-diag-ribs', type: DependencyEdgeType.DIAGNOSTIC, author: 'Dr. Adams (ER)', timestamp: daysAgo(10) },
    { id: 'e2', source: 'n-exam-breath', target: 'n-diag-lung', type: DependencyEdgeType.DIAGNOSTIC, author: 'Dr. Adams (ER)', timestamp: daysAgo(10) },
    { id: 'e3', source: 'n-exam-bowel', target: 'n-diag-rupture', type: DependencyEdgeType.DIAGNOSTIC, author: 'Dr. Adams (ER)', timestamp: daysAgo(10) },

    // T1 Edges
    { id: 'e4', source: 'n-img-cxr', target: 'n-diag-rupture', type: DependencyEdgeType.DIAGNOSTIC, author: 'Dr. Bell (Radiology)', timestamp: daysAgo(8), details: 'Imaging confirms diagnosis.' },
    { id: 'e5', source: 'n-img-cxr', target: 'n-diag-ribs', type: DependencyEdgeType.DIAGNOSTIC, author: 'Dr. Bell (Radiology)', timestamp: daysAgo(8), details: 'Imaging confirms diagnosis.' },
    { id: 'e6', source: 'n-diag-rupture', target: 'n-treat-laparotomy', type: DependencyEdgeType.THERAPEUTIC, author: 'Dr. Bell (Radiology)', timestamp: daysAgo(8), details: 'Diagnosis necessitates surgical intervention.' },

    // T2 Edges
    { id: 'e7', source: 'n-op-spleen', target: 'n-treat-splenectomy', type: DependencyEdgeType.THERAPEUTIC, author: 'Dr. Chen (Surgery)', timestamp: daysAgo(5) },
    
    // T3 Edges
    { id: 'e8', source: 'n-treat-laparotomy', target: 'n-op-spleen', type: DependencyEdgeType.CAUSAL, author: 'Dr. Chen (Surgery)', timestamp: daysAgo(2), details: 'Laparotomy led to the discovery of the splenic injury.' },
    { id: 'e9', source: 'n-treat-laparotomy', target: 'n-treat-repair', type: DependencyEdgeType.CAUSAL, author: 'Dr. Chen (Surgery)', timestamp: daysAgo(2) },
    { id: 'e10', source: 'n-treat-repair', target: 'n-outcome-recovery', type: DependencyEdgeType.CAUSAL, author: 'Dr. Chen (Surgery)', timestamp: daysAgo(1) },
    { id: 'e11', source: 'n-treat-splenectomy', target: 'n-outcome-recovery', type: DependencyEdgeType.CAUSAL, author: 'Dr. Chen (Surgery)', timestamp: daysAgo(1) },
  ]
});
