import { AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {ChatSection} from '../chat-section/chat-section';

//BACKEND IS COMMENTED AT THE BOTTOM

@Component({
  selector: 'app-med-graph',
  imports: [ChatSection],
  templateUrl: './med-graph.html',
  styleUrl: './med-graph.css'
})
export class MedGraph implements OnInit, AfterViewInit {

  @ViewChild('graphFrame') iframe!: ElementRef<HTMLIFrameElement>;

  data = [


    //EDIT AFTER ADDING MERGING: 
    /*
    {
      "id": 10,
      "text_1": "Final Diagnosis: H. Pylori Gastritis",
      "father": 9,
      "isDiagnosis": true,
      "branchState": "completed", <--------------- IMPORTANT
      "mergeTargetId": 13 <--------------- IMPORTANT
    }
    */ 
  // =========================
  // 1 — ROOT CONSULTATION
  // =========================
  {
    id: 1,
    text_1: "Initial Consultation: Epigastric Pain",
    father: null,
    category: "Consultation",
    priority: "Low",
    normality: "Normal",
    dateIssued: "2025-10-05",
    details: "Patient presents with postprandial epigastric pain and nausea. No alarm symptoms.",
    isDiagnosis: false
  },

  // =========================
  // 2 — LAB INVESTIGATIONS
  // =========================
  {
    id: 2,
    text_1: "Baseline Laboratory Tests Ordered",
    father: 1,
    category: "Lab",
    priority: "Medium",
    normality: "Pending",
    dateIssued: "2025-10-06",
    details: "CBC, liver panel, and H. pylori stool antigen requested.",
    isDiagnosis: false
  },

  {
    id: 3,
    text_1: "Laboratory Results",
    father: 2,
    category: "Lab",
    priority: "High",
    normality: "Abnormal",
    dateIssued: "2025-10-07",
    details: "CBC normal. Mild ALT elevation. H. pylori stool antigen positive.",
    isDiagnosis: false
  },

  // =========================
  // 3 — IMAGING
  // =========================
  {
    id: 4,
    text_1: "Abdominal Ultrasound",
    father: 1,
    category: "Imaging",
    priority: "Medium",
    normality: "Normal",
    dateIssued: "2025-10-08",
    details: "No structural abnormalities. Gallbladder and liver normal.",
    isDiagnosis: false
  },

  // =========================
  // 4 — AI DIFFERENTIAL HUB
  // =========================
  {
    id: 5,
    text_1: "AI Differential Analysis",
    father: 1,
    category: "AISuggestion",
    priority: "Medium",
    normality: "Pending",
    dateIssued: "2025-10-09",
    details: "AI suggests H. pylori gastritis vs functional dyspepsia.",
    isDiagnosis: false
  },

  {
    id: 6,
    text_1: "Clinical Correlation",
    father: 5,
    category: "AISuggestion",
    priority: "Medium",
    normality: "Normal",
    dateIssued: "2025-10-09",
    details: "Meal-related pain + positive H. pylori strongly suggest gastritis.",
    isDiagnosis: false
  },

  // =========================
  // 5 — PRIMARY DIAGNOSIS PATH
  // =========================
  {
    id: 7,
    text_1: "Diagnosis: H. pylori Gastritis",
    father: 6,
    category: "AISuggestion",
    priority: "High",
    normality: "Abnormal",
    dateIssued: "2025-10-10",
    details: "Confirmed by positive stool antigen and symptom pattern.",
    isDiagnosis: true
  },

  {
    id: 8,
    text_1: "Triple Therapy Initiated",
    father: 7,
    category: "Prescription",
    priority: "Medium",
    normality: "Normal",
    dateIssued: "2025-10-11",
    details: "PPI + Clarithromycin + Amoxicillin for 14 days.",
    isDiagnosis: false
  },

  {
    id: 9,
    text_1: "Follow-Up & Eradication Test",
    father: 7,
    category: "Consultation",
    priority: "Medium",
    normality: "Normal",
    dateIssued: "2025-10-25",
    details: "Symptoms improved. H. pylori eradication confirmed.",
    isDiagnosis: false
  },

  // =========================
  // 6 — SECONDARY DIAGNOSIS PATH
  // (Asymmetric branch to avoid rendering issues)
  // =========================
  {
    id: 10,
    text_1: "Persistent Symptoms Review",
    father: 6,
    category: "AISuggestion",
    priority: "Low",
    normality: "Normal",
    dateIssued: "2025-10-30",
    details: "Despite eradication, mild dyspepsia persists.",
    isDiagnosis: false
  },

  {
    id: 11,
    text_1: "Diagnosis: Functional Dyspepsia",
    father: 10,
    category: "AISuggestion",
    priority: "Medium",
    normality: "Abnormal",
    dateIssued: "2025-11-01",
    details: "Functional gastrointestinal disorder considered after exclusion of organic causes.",
    isDiagnosis: true
  },

  // {
  //   id: 12,
  //   text_1: "Diagnosis: Test branch",
  //   father: 10,
  //   category: "Imaging",
  //   priority: "High",
  //   normality: "Abnormal",
  //   dateIssued: "2025-11-01",
  //   details: "Functional gastrointestinal disorder considered after exclusion of organic causes.",
  //   isDiagnosis: true
  // }

];

  // data = [
  //   // ROOT CONSULTATION
  //   { id: 1, text_1: "Initial Consultation: Epigastric Pain",
  //     father: null, category: "Consultation", priority: "Low",
  //     normality: "Normal", dateIssued: "2025-10-05",
  //     details: "Patient reports epigastric pain, nausea, and early satiety.",
  //     isDiagnosis: false },

  //   // --------------------------------------
  //   // STEP 1 — PRIMARY INVESTIGATIONS (Labs)
  //   // --------------------------------------
  //   { id: 2, text_1: "Order Baseline Labs",
  //     father: 1, category: "Lab", priority: "Medium",
  //     normality: "Pending", dateIssued: "2025-10-06",
  //     details: "CBC, liver panel, H. pylori stool antigen.",
  //     isDiagnosis: false },

  //   { id: 3, text_1: "CBC Result",
  //     father: 2, category: "Lab", priority: "Low",
  //     normality: "Normal", dateIssued: "2025-10-07",
  //     details: "CBC normal; no signs of anemia.",
  //     isDiagnosis: false },

  //   { id: 4, text_1: "Liver Enzymes",
  //     father: 2, category: "Lab", priority: "High",
  //     normality: "Abnormal", dateIssued: "2025-10-07",
  //     details: "ALT mildly elevated.",
  //     isDiagnosis: false },

  //   { id: 5, text_1: "H. Pylori Antigen",
  //     father: 2, category: "Lab", priority: "High",
  //     normality: "Abnormal", dateIssued: "2025-10-08",
  //     details: "H. pylori antigen positive.",
  //     isDiagnosis: false },

  //   // --------------------------------------
  //   // STEP 2 — IMAGING
  //   // --------------------------------------
  //   { id: 6, text_1: "Ultrasound Request",
  //     father: 1, category: "Imaging", priority: "Medium",
  //     normality: "Pending", dateIssued: "2025-10-08",
  //     details: "Requested to evaluate liver and upper abdomen.",
  //     isDiagnosis: false },

  //   { id: 7, text_1: "Ultrasound Imaging",
  //     father: 6, category: "Imaging", priority: "Low",
  //     normality: "Normal", dateIssued: "2025-10-09",
  //     details: "Normal ultrasound; no structural abnormalities.",
  //     isDiagnosis: false },

  //   // --------------------------------------
  //   // STEP 3 — AI / CLINICAL DIFFERENTIAL
  //   // --------------------------------------
  //   { id: 8, text_1: "AI Clinical Suggestion",
  //     father: 1, category: "AISuggestion", priority: "Medium",
  //     normality: "Pending", dateIssued: "2025-10-09",
  //     details: "AI suggests gastritis vs peptic ulcer disease.",
  //     isDiagnosis: false },

  //   { id: 9, text_1: "Differential Assessment",
  //     father: 8, category: "AISuggestion", priority: "High",
  //     normality: "Abnormal", dateIssued: "2025-10-10",
  //     details: "Symptoms consistent with H. pylori-associated gastritis.",
  //     isDiagnosis: false },

  //   // ---- Additional Clinical Differentials (NON-DIAGNOSIS) ----
  //   {
  //     id: 16,
  //     father: 9,
  //     category: "AISuggestion",
  //     text_1: "Rule-Out: Gallbladder Disease",
  //     priority: "Medium",
  //     normality: "Normal",
  //     dateIssued: "2025-10-10",
  //     details: "No RUQ pain; ultrasound normal—unlikely biliary cause.",
  //     isDiagnosis: false
  //   },

  //   {
  //     id: 17,
  //     father: 9,
  //     category: "AISuggestion",
  //     text_1: "Rule-Out: GERD",
  //     priority: "Low",
  //     normality: "Normal",
  //     dateIssued: "2025-10-10",
  //     details: "No heartburn or regurgitation—GERD not primary.",
  //     isDiagnosis: false
  //   },

  //   {
  //     id: 18,
  //     father: 9,
  //     category: "AISuggestion",
  //     text_1: "Symptom Pattern Correlation",
  //     priority: "Low",
  //     normality: "Normal",
  //     dateIssued: "2025-10-11",
  //     details: "Pain after meals suggests gastritis/ulcer pattern.",
  //     isDiagnosis: false
  //   },

  //   // --------------------------------------
  //   // STEP 4 — CONFIRMATORY DIAGNOSIS (Original Path)
  //   // --------------------------------------
  //   { id: 10, text_1: "Final Diagnosis: H. Pylori Gastritis",
  //     father: 9, category: "AISuggestion", priority: "High",
  //     normality: "Abnormal", dateIssued: "2025-10-11",
  //     details: "Positive stool antigen + symptom correlation.",
  //     isDiagnosis: true },

  //   // -----------------------------------------------------
  //   // NEW DIAGNOSIS NODE — must be under a branch that has
  //   // *zero* ancestors with isDiagnosis = true.
  //   // → We attach it under father: 18 (no diagnosis above)
  //   // -----------------------------------------------------
  //   {
  //     id: 19,
  //     father: 18,
  //     category: "AISuggestion",
  //     text_1: "Diagnosis: Functional Dyspepsia",
  //     priority: "Medium",
  //     normality: "Abnormal",
  //     dateIssued: "2025-10-11",
  //     details: "Symptoms persist despite H. pylori pattern; functional disorder possible.",
  //     isDiagnosis: true
  //   },

  //   // --------------------------------------
  //   // STEP 5 — TREATMENT PLAN
  //   // --------------------------------------
  //   { id: 11, text_1: "Triple Therapy Prescription",
  //     father: 10, category: "Prescription", priority: "Medium",
  //     normality: "Normal", dateIssued: "2025-10-12",
  //     details: "PPI + Clarithromycin + Amoxicillin (14 days).",
  //     isDiagnosis: false },

  //   { id: 12, text_1: "Pain Management",
  //     father: 11, category: "Prescription", priority: "Low",
  //     normality: "Normal", dateIssued: "2025-10-12",
  //     details: "Avoid NSAIDs; antacids PRN.",
  //     isDiagnosis: false },

  //   // --------------------------------------
  //   // STEP 6 — FOLLOW-UP & RESPONSE
  //   // --------------------------------------
  //   { id: 13, text_1: "Follow-Up Visit",
  //     father: 10, category: "Consultation", priority: "Low",
  //     normality: "Normal", dateIssued: "2025-10-26",
  //     details: "Symptoms improved; patient tolerating therapy.",
  //     isDiagnosis: false },

  //   { id: 14, text_1: "Post-Treatment H. Pylori Test",
  //     father: 13, category: "Lab", priority: "Medium",
  //     normality: "Pending", dateIssued: "2025-10-27",
  //     details: "Test for eradication after therapy.",
  //     isDiagnosis: false },

  //   { id: 15, text_1: "Eradication Confirmed",
  //     father: 14, category: "Lab", priority: "Normal",
  //     normality: "Normal", dateIssued: "2025-11-02",
  //     details: "H. pylori eradicated successfully.",
  //     isDiagnosis: false },

  //   // -------------------------------------------------
  //   // FINAL CONSULTATION — original diagnosis was false
  //   // -------------------------------------------------
  //   {
  //     id: 20,
  //     father: 19,
  //     category: "Consultation",
  //     text_1: "Re-Evaluation: Initial Diagnosis Incorrect",
  //     priority: "High",
  //     normality: "Abnormal",
  //     dateIssued: "2025-11-05",
  //     details: "Persistent symptoms revealed that H. pylori was not the primary cause.",
  //     isDiagnosis: false
  //   }
  // ];

  constructor(private route: ActivatedRoute) {}

 ngAfterViewInit() {
  this.iframe.nativeElement.onload = () => {
    this.sendNodeList();
  };

  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    const msg = event.data;

    if (msg?.type === 'NODE_UPDATE') {
      if (msg.action === 'add')    this.data.push(msg.node);
      if (msg.action === 'edit') {
        const idx = this.data.findIndex(n => n.id === msg.node.id);
        if (idx > -1) this.data[idx] = { ...this.data[idx], ...msg.node };
      }
      if (msg.action === 'delete') {
        this.data = this.data.filter(n => n.id !== msg.node.id);
      }
    }

    // Imported from inside the iframe — keep Angular in sync
    if (msg?.type === 'IMPORT_GRAPH') {
      this.data = msg.nodes;
    }
  });
}

sendNodeList() {
  this.iframe.nativeElement.contentWindow?.postMessage(
    { type: 'INIT_GRAPH', nodes: this.data },
    '*'
  );
}

// Called from the Angular template import button (optional — iframe handles it directly)
triggerImport() {
  const input = document.getElementById('angularImportInput') as HTMLInputElement;
  input?.click();
}

onImportFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target?.result as string);
      if (!Array.isArray(imported)) throw new Error();
      this.data = imported;
      this.sendNodeList();
    } catch {
      alert('Invalid JSON file.');
    }
  };
  reader.readAsText(file);
  input.value = '';
}
  //static frontend
  ngOnInit() {
    window.addEventListener('message', (event) => {
      if (event.origin !== window.location.origin) return;
    });
  }





  //CHAT 

  isChatOpen = false;
  toggleChat() { this.isChatOpen = !this.isChatOpen; }

}


//Test communication with iframe 

  // @ViewChild('graphFrame') iframe!: ElementRef<HTMLIFrameElement>;

  // ngOnInit() {
  //   window.addEventListener('message', (event) => {
  //     console.log('Angular received:', event.data);
  //   });
  //   if (event.data.type === 'NODE_CLICKED') {
  //      console.log('Node clicked:', event.data.payload);
  //      //react, route, or call backend
  //   }

  // }

  // ping() {
  //   this.iframe.nativeElement.contentWindow?.postMessage(
  //     { type: 'PING' },
  //     '*'
  //   );
  // }






  //TRY THIS BACKEND CODE 

// import { AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
// import { ActivatedRoute } from '@angular/router';
// import { PatientApiService } from '../services/patientApi/patient-api-service';

// @Component({
//   selector: 'app-med-graph',
//   imports: [],
//   templateUrl: './med-graph.html',
//   styleUrl: './med-graph.css'
// })
// export class MedGraph implements OnInit, AfterViewInit {

//   @ViewChild('graphFrame') iframe!: ElementRef<HTMLIFrameElement>;
//   data: any[] = []; // will be populated from backend

//   constructor(
//     private route: ActivatedRoute,
//     private patientApi: PatientApiService
//   ) {}

//   ngOnInit() {
//     const patientId = Number(this.route.snapshot.paramMap.get('id'));
//     if (patientId) {
//       this.patientApi.getPatientGraph(patientId).subscribe({
//         next: (graphData) => {
//           this.data = graphData;
//           this.sendNodeList(); // send to iframe if loaded
//         },
//         error: (err) => console.error('Failed to load patient graph', err)
//       });
//     }
//   }

//   ngAfterViewInit() {
//     this.iframe.nativeElement.onload = () => {
//       this.sendNodeList();
//     };

//     window.addEventListener('message', (event) => {
//       if (event.origin !== window.location.origin) return;
//       const data = event.data;
//       if (data?.type === 'NODE_UPDATE') {
//         console.log('Node updated from iframe:', data);
//       }
//     });
//   }

//   sendNodeList() {
//     if (!this.data || !this.iframe.nativeElement.contentWindow) return;

//     this.iframe.nativeElement.contentWindow.postMessage(
//       { type: 'INIT_GRAPH', nodes: this.data },
//       '*'
//     );
//   }
// }
