import { Injectable } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatPayload {
  query: string;
  history: ChatHistoryItem[];
  mode: string;
  score_threshold: number;
  top_k: number;
  temperature: number;
}

export interface ChatEvent {
  type: 'context' | 'token';
  content: any;
}

// ── Mock data ────────────────────────────────────────────────────────────────

const MOCK_RESPONSES: Record<string, { context: any[]; text: string }> = {
  auto: {
    context: [],
    text: `**Assessment:**

• Possible acute coronary syndrome – consider ECG and troponin levels
• Hypertensive urgency – monitor BP closely
• Pulmonary embolism in differential diagnosis

**Recommended Next Steps:**

• Immediate 12-lead ECG
• Cardiac enzyme panel (Troponin I/T, CK-MB)
• Chest X-ray (PA and lateral views)
• D-dimer assay if PE is suspected
• Continuous vital sign monitoring with pulse oximetry
• IV access and oxygen supplementation as needed

**Clinical Note:**
Always reassess within 30 minutes of initial evaluation and escalate to cardiology if troponin is elevated.`
  },

  mcp: {
    context: [
      {
        source: 'PubMed — Drug Interaction Study',
        content: `**Summary:** Aspirin interacts with P2Y12 inhibitors through enhanced antiplatelet mechanisms, significantly increasing bleeding risk when used in dual antiplatelet therapy.\n\n**Source Detail:**\n{'title': 'Dual Antiplatelet Therapy: Balancing Efficacy and Bleeding Risk', 'pmid': '29084738', 'url': 'https://pubmed.ncbi.nlm.nih.gov/29084738/', 'abstract': 'Dual antiplatelet therapy with aspirin and a P2Y12 inhibitor is the standard of care after ACS...'}`
      },
      {
        source: 'PubMed — Clinical Trial',
        content: `**Summary:** Apixaban demonstrated superior stroke prevention compared to aspirin in patients with subclinical atrial fibrillation with a history of TIA, at the cost of increased major bleeding events.\n\n**Source Detail:**\n{'title': 'Apixaban versus Aspirin for Stroke Prevention in Subclinical AF', 'pmid': '39862882', 'url': 'https://pubmed.ncbi.nlm.nih.gov/39862882/', 'abstract': 'In the ARTESiA trial, apixaban reduced stroke or systemic embolism compared with aspirin...'}`
      },
      {
        source: 'PubMed — Oncology Research',
        content: `**Summary:** Aspirin inhibits arachidonic acid metabolism in ARID1A-deficient colorectal cancer, enhancing immunotherapy efficacy through CD8+ T cell activation.\n\n**Source Detail:**\n{'title': 'Targeting Arachidonic Acid Metabolism Enhances Immunotherapy in ARID1A-Deficient CRC', 'pmid': '39652583', 'url': 'https://pubmed.ncbi.nlm.nih.gov/39652583/', 'abstract': 'ARID1A deficiency is mutated in approximately 10% of colorectal cancers...'}`
      }
    ],
    text: `**1. Clinical Summary**

Aspirin is an antiplatelet agent with several clinically significant interactions:

* **P2Y12 Inhibitor Interaction:** Dual antiplatelet therapy substantially increases bleeding risk. Careful assessment of the patient's bleeding profile is mandatory before co-prescribing.

* **Apixaban Comparison:** In patients with subclinical atrial fibrillation and prior stroke/TIA, apixaban offers a 7% absolute risk reduction in stroke versus aspirin, though with a 3% increase in major bleeding events.

* **Oncology Synergy:** Aspirin may enhance immune checkpoint inhibitor efficacy in ARID1A-deficient colorectal cancer by suppressing the arachidonic acid pathway.

**2. Evidence-Based Recommendations**

* Monitor closely for bleeding when combining aspirin with any antiplatelet or anticoagulant agent
* Consider switching to apixaban in high-risk AF patients with prior cerebrovascular events
* Further research is needed before recommending aspirin as adjuvant immunotherapy

**3. Key Considerations**

Always individualize therapy based on the patient's comorbidities, bleeding risk profile, and concurrent medications.`
  },

  rag: {
    context: [],
    text: `**Diabetes Mellitus — Overview**

Based on the clinical knowledge base:

**Definition:**
Diabetes is a chronic metabolic disorder characterized by persistent hyperglycemia resulting from defects in insulin secretion, insulin action, or both.

**Classification:**

* **Type 1 DM:** Autoimmune destruction of pancreatic β-cells; absolute insulin deficiency
* **Type 2 DM:** Progressive insulin secretory defect on a background of insulin resistance
* **Gestational DM:** Glucose intolerance first diagnosed during pregnancy

**Diagnostic Criteria (ADA):**

* Fasting plasma glucose ≥ 126 mg/dL
* 2-hour plasma glucose ≥ 200 mg/dL during OGTT
* HbA1c ≥ 6.5%
* Random plasma glucose ≥ 200 mg/dL with classic symptoms

**Management Principles:**

* Lifestyle modification (diet, exercise, weight control)
* Pharmacotherapy: Metformin first-line for Type 2; insulin for Type 1
* Regular monitoring of HbA1c, renal function, lipids, and retinal status
* Target HbA1c < 7% for most non-pregnant adults`
  }
};

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class AiChatService {

  streamChat(payload: ChatPayload): Observable<ChatEvent> {
    const env = environment as any;
    const useMock: boolean = env.aiMock ?? true;
    const aiUrl:   string  = env.aiUrl  ?? '/ai';

    console.group(`%c[AI Chat] ▶ Request (mode: ${payload.mode}${useMock ? ' · MOCK' : ''})`, 'color:#4A90E2;font-weight:bold');
    console.log('Payload:', JSON.parse(JSON.stringify(payload)));
    console.groupEnd();

    let assembled = '';

    const source$ = useMock
      ? this.mockStream(payload.mode)
      : this.fetchStream(payload, aiUrl);

    return source$.pipe(
      tap({
        next: event => {
          if (event.type === 'context') {
            console.log('%c[AI Chat] ◈ Context', 'color:#F5A623;font-weight:bold', event.content);
          } else if (event.type === 'token') {
            assembled += event.content;
          }
        },
        error: err => {
          console.error('[AI Chat] ✖ Error:', err);
        },
        complete: () => {
          console.group('%c[AI Chat] ✔ Complete', 'color:#417505;font-weight:bold');
          console.log('Full response:', assembled);
          console.groupEnd();
        }
      })
    );
  }

  // ── Real SSE fetch ──────────────────────────────────────────────────────────

  private fetchStream(payload: ChatPayload, aiUrl: string): Observable<ChatEvent> {
    return new Observable(observer => {
      const controller = new AbortController();

      fetch(`${aiUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      })
      .then(response => {
        if (!response.ok) {
          observer.error(new Error(`HTTP ${response.status}: ${response.statusText}`));
          return;
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const pump = (): Promise<void> =>
          reader.read().then(({ done, value }) => {
            if (done) { observer.complete(); return; }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data:')) continue;

              const data = trimmed.slice(5).trim();
              if (data.startsWith('[DONE')) { observer.complete(); return; }

              try {
                observer.next(JSON.parse(data) as ChatEvent);
              } catch { /* skip malformed */ }
            }

            return pump();
          });

        pump().catch(err => {
          if (err.name !== 'AbortError') observer.error(err);
        });
      })
      .catch(err => {
        if (err.name !== 'AbortError') observer.error(err);
      });

      return () => controller.abort();
    });
  }

  // ── Mock SSE stream ─────────────────────────────────────────────────────────

  private mockStream(mode: string): Observable<ChatEvent> {
    const mock = MOCK_RESPONSES[mode] ?? MOCK_RESPONSES['auto'];

    return new Observable(observer => {
      let cancelled = false;

      const emit = async () => {
        // Emit context event first
        await this.delay(300);
        if (cancelled) return;
        observer.next({ type: 'context', content: mock.context });

        // Tokenise by splitting on spaces while preserving them
        const tokens = this.tokenise(mock.text);

        for (const token of tokens) {
          if (cancelled) return;
          await this.delay(this.randomDelay());
          observer.next({ type: 'token', content: token });
        }

        if (!cancelled) observer.complete();
      };

      emit().catch(err => observer.error(err));

      return () => { cancelled = true; };
    });
  }

  private tokenise(text: string): string[] {
    // Split into small chunks similar to real LLM token streaming
    const tokens: string[] = [];
    const words = text.split(/(\s+)/);
    for (const w of words) {
      if (w.length <= 3) {
        tokens.push(w);
      } else {
        // Break longer words into 2–4 char chunks occasionally
        let i = 0;
        while (i < w.length) {
          const chunkSize = Math.random() > 0.6 ? 1 : Math.floor(Math.random() * 3) + 2;
          tokens.push(w.slice(i, i + chunkSize));
          i += chunkSize;
        }
      }
    }
    return tokens;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private randomDelay(): number {
    // Simulate variable LLM token speed: 20–80ms per token
    return Math.floor(Math.random() * 60) + 20;
  }
}
