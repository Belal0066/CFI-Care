import {
  AfterViewInit,
  Component,
  ElementRef,
  OnInit,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { PatientApiService } from '../services/patientApi/patient-api-service';
import { ChatSection } from '../chat-section/chat-section';

@Component({
  selector: 'app-med-graph',
  standalone: true,
  imports: [CommonModule, ChatSection],
  templateUrl: './med-graph.html',
  styleUrl: './med-graph.css',
})
export class MedGraph implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('graphFrame') iframe!: ElementRef<HTMLIFrameElement>;

  patientId: string | null = null;
  eocId: string = 'eoc-default'; // Default Episode of Care ID
  data: any[] = [];
  loading = true;
  error: string | null = null;
  isChatOpen = false;
  iframeLoaded = false;
  private messageHandler: ((event: MessageEvent) => void) | null = null;

  constructor(
    private route: ActivatedRoute,
    private patientApi: PatientApiService,
  ) {}

  ngOnInit() {
    // Get patient ID from route params
    this.patientId = this.route.snapshot.paramMap.get('id');
    console.log('[MED-GRAPH][ngOnInit] route patientId =', this.patientId);

    if (this.patientId) {
      this.loadPatientGraph(this.patientId);
    } else {
      this.error = 'No patient ID provided';
      this.loading = false;
    }

    // Listen for messages from iframe
    this.messageHandler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      const data = event.data;
      if (data?.type) {
        console.log(
          '[MED-GRAPH][iframe->angular] message type =',
          data.type,
          data,
        );
      }
      if (data?.type === 'NODE_UPDATE') {
        console.log('Received node update:', data);
        this.handleNodeUpdate(data.action, data.node, data.parentNodeId);
      }
    };
    window.addEventListener('message', this.messageHandler);
  }

  ngOnDestroy() {
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
    }
  }

  toggleChat() {
    this.isChatOpen = !this.isChatOpen;
  }

  handleNodeUpdate(action: string, node: any, parentNodeId?: string) {
    if (!this.patientId) return;

    switch (action) {
      case 'add':
        this.addNode(node, parentNodeId);
        break;
      case 'edit':
        this.updateNode(node);
        break;
      case 'delete':
        this.deleteNode(node.id);
        break;
    }
  }

  addNode(node: any, parentNodeId?: string) {
    if (!this.patientId) return;

    // Store temp ID to update later when backend responds with real ID
    const tempId = node.id;

    const request = {
      patientId: this.patientId,
      eocId: this.eocId,
      nodeData: {
        // Don't send temp ID - let backend generate a proper UUID
        // id: node.id,
        text_1: node.text_1,
        title: node.text_1,
        category: node.category,
        priority: node.priority,
        normality: node.normality,
        dateIssued: node.dateIssued,
        details: node.details,
        isDiagnosis: node.isDiagnosis || false,
        isManualBranch: node.isManualBranch || false,
        branchState: node.branchState || 'in_progress',
      },
      parentNodeId: parentNodeId || node.father,
    };

    this.patientApi.addGraphNode(request).subscribe({
      next: (result) => {
        console.log('Node added successfully:', result);
        // Update eocId if backend created a new one
        if (result.eocId) {
          this.eocId = result.eocId;
        }
        // Notify iframe of success with both temp ID and real ID
        this.sendMessage({
          type: 'NODE_SAVED',
          action: 'add',
          node: result,
          tempId,
        });
      },
      error: (err) => {
        console.error('Failed to add node:', err);
        console.error('[MED-GRAPH][addNode] backend error payload =', {
          status: err?.status,
          message: err?.message,
          error: err?.error,
        });
        this.sendMessage({
          type: 'NODE_ERROR',
          action: 'add',
          error: err.message,
          tempId,
        });
      },
    });
  }

  updateNode(node: any) {
    if (!this.patientId) return;

    const request = {
      patientId: this.patientId,
      nodeId: node.id,
      updatedData: {
        text_1: node.text_1,
        title: node.text_1,
        category: node.category,
        priority: node.priority,
        normality: node.normality,
        dateIssued: node.dateIssued,
        details: node.details,
        isDiagnosis: node.isDiagnosis || false,
        isManualBranch: node.isManualBranch || false,
        branchState: node.branchState || 'in_progress',
      },
      // Preserve the parent relationship - only send if we want to change it
      // undefined means "don't change", null means "make it a root node"
      parentNodeId: undefined, // Don't change parent during edit
    };

    this.patientApi.updateGraphNode(request).subscribe({
      next: (result) => {
        console.log('Node updated successfully:', result);
        this.sendMessage({ type: 'NODE_SAVED', action: 'edit', node: result });
      },
      error: (err) => {
        console.error('Failed to update node:', err);
        this.sendMessage({
          type: 'NODE_ERROR',
          action: 'edit',
          node: { id: node.id }, // Include node id for rollback
          error: err.message,
        });
      },
    });
  }

  deleteNode(nodeId: string) {
    if (!this.patientId) return;

    this.patientApi.deleteGraphNode(this.patientId, nodeId).subscribe({
      next: (result) => {
        console.log('Node deleted successfully:', result);
        this.sendMessage({ type: 'NODE_SAVED', action: 'delete', nodeId });
      },
      error: (err) => {
        console.error('Failed to delete node:', err);
        this.sendMessage({
          type: 'NODE_ERROR',
          action: 'delete',
          nodeId, // Include nodeId for rollback
          error: err.message,
        });
      },
    });
  }

  sendMessage(message: any) {
    if (this.iframe?.nativeElement?.contentWindow) {
      console.log('[MED-GRAPH][angular->iframe] posting message =', message);
      this.iframe.nativeElement.contentWindow.postMessage(message, '*');
    }
  }

  loadPatientGraph(patientId: string) {
    this.loading = true;
    this.error = null;
    console.log(
      '[MED-GRAPH][loadPatientGraph] requesting patient graph for',
      patientId,
    );

    this.patientApi.getPatientGraph(patientId).subscribe({
      next: (response) => {
        console.log('[MED-GRAPH][loadPatientGraph] raw response =', response);
        // Handle both old format (array) and new format ({ nodes, eocId })
        if (Array.isArray(response)) {
          this.data = response;
        } else {
          this.data = response.nodes || [];
          // Update eocId if provided by backend
          if (response.eocId) {
            this.eocId = response.eocId;
          }
        }
        console.log(
          '[MED-GRAPH][loadPatientGraph] parsed nodes =',
          this.data.length,
          'eocId =',
          this.eocId,
        );
        this.loading = false;
        // Send to iframe if already loaded
        if (this.iframeLoaded) {
          console.log(
            '[MED-GRAPH][loadPatientGraph] iframe already loaded, sending INIT_GRAPH',
          );
          this.sendNodeList();
        }
      },
      error: (err) => {
        console.error('Failed to load patient graph', err);
        this.error =
          'Failed to load patient graph. Make sure the backend is running.';
        this.loading = false;
      },
    });
  }

  ngAfterViewInit() {
    // Wait for iframe to load fully
    this.iframe.nativeElement.onload = () => {
      this.iframeLoaded = true;
      console.log('[MED-GRAPH][iframe] loaded, loading state =', this.loading);
      // Always send node list when iframe loads (even if empty)
      // This allows the iframe to show the empty state and enable the Add Node button
      if (!this.loading) {
        console.log('[MED-GRAPH][iframe] sending INIT_GRAPH after iframe load');
        this.sendNodeList();
      }
    };
  }

  sendNodeList() {
    if (!this.iframe?.nativeElement?.contentWindow) {
      console.warn(
        '[MED-GRAPH][sendNodeList] iframe contentWindow not available',
      );
      return;
    }

    console.log(
      '[MED-GRAPH][sendNodeList] sending INIT_GRAPH with nodes =',
      this.data.length,
      'patientId =',
      this.patientId,
      'eocId =',
      this.eocId,
    );

    this.iframe.nativeElement.contentWindow.postMessage(
      {
        type: 'INIT_GRAPH',
        nodes: this.data,
        patientId: this.patientId,
        eocId: this.eocId,
      },
      '*',
    );
  }
}
