import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';


type ChatMessage = {
  text?: string;
  type: 'incoming' | 'outgoing' | 'error';
  files?: { name: string; url: string; type: string }[];
  liked?: boolean | null;
  confidence?: number;
  citations?: { title: string; url: string }[];
};


@Component({
  selector: 'app-chat-section',
  imports: [FormsModule, CommonModule],
  templateUrl: './chat-section.html',
  styleUrls: ['./chat-section.css']
})
export class ChatSection implements OnInit{
  @Input() showChatbot = false;
  @Output() close = new EventEmitter<void>();
  @ViewChild('chatWindow', { static: false }) chatWindow!: ElementRef<HTMLElement>;
  @ViewChild('fileInput', { static: false }) fileInput!: ElementRef<HTMLInputElement>;

  userMessage = '';
  isRecording = false;
  attachments: { name: string; url: string; type: string; id: string }[] = [];
  messages: ChatMessage[] = [];


  isMaximized = false;

  responseModes = ['Concise', 'Detailed', 'Bullet Points', 'Differential'];
  activeMode = 'Concise';

  isBranch = false;
  branchOriginId = '';
  branchFromPoint = 0;

  citationsPanelOpen = false;
  activeCitations: { title: string; url: string }[] = [];

  editingSessionId: string | null = null;
  editingTitle = '';

  sessions: { id: string; title: string; date: string; messages: any[] }[] = [
    { id: '1', title: 'Session 1', date: 'Today', messages: [] }
  ];
  filteredSessions = [...this.sessions];
  activeSessionId = '1';
  convSearch = '';

  private sampleResponse = `Assessment:
    • Possible acute coronary syndrome – consider ECG and troponin levels
    • Hypertensive urgency – monitor closely
    • Pulmonary embolism in differential

    Recommended Next Steps:
    • Immediate ECG
    • Cardiac enzyme panel (Troponin I/T)
    • Chest X-ray (PA and lateral)
    • D-dimer if PE suspected
    • Continuous vital sign monitoring`;


    ngOnInit() {
      const params = new URLSearchParams(window.location.search);
      if (params.get('forked') === '1') {
        try {
          const forkedMessages: ChatMessage[] = JSON.parse(params.get('messages') || '[]');
          const originId = params.get('origin') || 'unknown';
          const fromPoint = params.get('from') || '?';

          this.messages = forkedMessages;
          this.isBranch = true;
          this.branchOriginId = originId;
          this.branchFromPoint = Number(fromPoint);

          // Force maximize on branch tabs
          this.isMaximized = true;
          const host = document.querySelector('app-chat-section');
          if (host) host.classList.add('maximized');

          // Add a visual divider as the last message
          this.messages.push({
            type: 'incoming',
            text: `🌿 Branched from session "${originId}" at message ${fromPoint}. Continue from here independently.`
          });

          this.scrollToBottom();
        } catch {
          console.warn('Failed to restore forked session.');
        }
      }
    }

    sendMessage() {
      const trimmed = (this.userMessage || '').trim();
      if (!trimmed && this.attachments.length === 0) return;

      const outgoingFiles = this.attachments.length > 0 ? [...this.attachments] : undefined;
      this.messages.push({ text: trimmed || undefined, type: 'outgoing', files: outgoingFiles });
      // Auto-title the session from the first user message
      const currentSession = this.sessions.find(s => s.id === this.activeSessionId);
      if (currentSession && currentSession.title === 'New Chat' || currentSession?.title === 'Session 1') {
        currentSession.title = trimmed.length > 27 ? trimmed.slice(0, 27) + '…' : trimmed;
        this.filteredSessions = [...this.sessions];
      }
      this.attachments = [];
      this.userMessage = '';

      const temp: ChatMessage = { text: 'Analyzing…', type: 'incoming' };
      this.messages.push(temp);
      this.scrollToBottom();

      setTimeout(() => {
        temp.text = this.sampleResponse;
        temp.confidence = 82; // mock — swap with real API value
        temp.citations = [    // mock — swap with real API value
          { title: 'AHA 2023 Chest Pain Guidelines', url: 'https://www.ahajournals.org' },
          { title: 'ESC Acute Coronary Syndrome', url: 'https://www.escardio.org' },
        ];
        this.scrollToBottom();
      }, 900);

      // Reset textarea height after send
      setTimeout(() => {
        const ta = document.querySelector('.composer-textarea') as HTMLTextAreaElement;
        if (ta) ta.style.height = 'auto';
      }, 0);

    }

  onFileSelected(event: any) {
    const files: FileList = event.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.attachments.push({
          name: file.name,
          url: e.target.result,
          type: file.type,
          id: Math.random().toString(36).slice(2)
        });
      };
      reader.readAsDataURL(file);
    });

    // Reset so same files can be re-selected
    if (this.fileInput?.nativeElement) this.fileInput.nativeElement.value = '';
  }

  removeAttachment(id: string) {
    this.attachments = this.attachments.filter(a => a.id !== id);
  }


  startEditTitle(s: any, event: MouseEvent) {
    event.stopPropagation();
    this.editingSessionId = s.id;
    this.editingTitle = s.title;
  }

  saveEditTitle(s: any) {
    s.title = this.editingTitle.trim() || s.title;
    this.filteredSessions = [...this.sessions];
    this.editingSessionId = null;
  }


  autoResize(event: Event) {
    const el = event.target as HTMLTextAreaElement;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  }

  // ── Voice input ──────────────────────────────────────────────────────────────
  private recognition: any;
  private finalVoiceTranscript = '';

  startRecording() {
    if (!('webkitSpeechRecognition' in window)) {
      alert('Voice input is not supported in this browser.');
      return;
    }
    this.isRecording = true;
    this.recognition = new (window as any).webkitSpeechRecognition();
    this.recognition.lang = 'en-US';
    this.recognition.interimResults = true;
    this.recognition.continuous = true;
    this.recognition.maxAlternatives = 1;
    this.finalVoiceTranscript = this.userMessage; // preserve any existing text

    this.recognition.onresult = (event: any) => {
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          this.finalVoiceTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }
      // Live update to textarea
      this.userMessage = this.finalVoiceTranscript + interimTranscript;
    };

    this.recognition.onend = () => {
      this.isRecording = false;
      this.recognition = null;
    };

    this.recognition.onerror = () => {
      this.isRecording = false;
      this.recognition = null;
    };

    this.recognition.start();
  }

  stopRecording() {
    if (!this.recognition) return;
    this.recognition.stop();
    this.isRecording = false;
  }

  onClose() { this.close.emit(); }

  private scrollToBottom() {
    setTimeout(() => {
      try {
        if (this.chatWindow?.nativeElement) {
          this.chatWindow.nativeElement.scrollTop = this.chatWindow.nativeElement.scrollHeight;
        }
      } catch {}
    }, 10);
  }

  toggleMaximize() {
    this.isMaximized = !this.isMaximized;
    const host = document.querySelector('app-chat-section');
    if (host) host.classList.toggle('maximized', this.isMaximized);
    if (!this.isMaximized) this.citationsPanelOpen = false;
  }

  toggleLike(msg: any, value: boolean) {
    msg.liked = msg.liked === value ? null : value;
  }

  copyResponse(msg: any) {
    if (msg.text) navigator.clipboard.writeText(msg.text);
  }

  retryMessage(index: number) {
    // Find the user message just before this AI reply
    const userMsg = [...this.messages].slice(0, index).reverse()
      .find(m => m.type === 'outgoing');
    this.messages.splice(index, 1);
    const temp: ChatMessage = { text: 'Analyzing…', type: 'incoming' };
    this.messages.splice(index, 0, temp);
    setTimeout(() => {
      temp.text = this.sampleResponse;
      temp.confidence = 82;
      temp.citations = [
        { title: 'AHA 2023 Chest Pain Guidelines', url: 'https://www.ahajournals.org' },
      ];
      this.scrollToBottom();
    }, 900);
  }

  forkFrom(index: number) {
    // Snapshot messages up to and including this AI reply
    const forkedMessages = this.messages.slice(0, index + 1).map(m => ({ ...m }));
    const forkPoint = index + 1;

    // Encode the forked state into URL params and open a new tab
    const params = new URLSearchParams({
      forked: '1',
      from: String(forkPoint),
      origin: this.activeSessionId,
      messages: JSON.stringify(forkedMessages)
    });

    const newTabUrl = `${window.location.pathname}?${params.toString()}`;
    window.open(newTabUrl, '_blank');
  }

  deleteMessage(index: number) {
    // Remove the AI reply and the user message before it
    const start = index > 0 && this.messages[index - 1]?.type === 'outgoing'
      ? index - 1 : index;
    this.messages.splice(start, index - start + 1);
  }

  openCitations(msg: any) {
    this.activeCitations = msg.citations || [];
    this.citationsPanelOpen = true;
  }

  newConversation() {
    // Save current messages into the active session BEFORE switching
    const cur = this.sessions.find(s => s.id === this.activeSessionId);
    if (cur) cur.messages = [...this.messages];

    const newId = Date.now().toString();
    const newSession = { id: newId, title: 'New Chat', date: 'Just now', messages: [] };
    this.sessions.push(newSession);
    this.filteredSessions = [...this.sessions];
    this.activeSessionId = newId;
    this.messages = [];
  }

  switchSession(id: string) {
    const s = this.sessions.find(x => x.id === id);
    if (!s) return;
    // Save current messages to current session
    const cur = this.sessions.find(x => x.id === this.activeSessionId);
    if (cur) cur.messages = [...this.messages];
    this.activeSessionId = id;
    this.messages = [...s.messages];
    this.citationsPanelOpen = false;
  }

  filterConversations() {
    const q = this.convSearch.toLowerCase().trim();
    if (!q) {
      this.filteredSessions = [...this.sessions];
      return;
    }
    this.filteredSessions = this.sessions.filter(s =>
      s.title.toLowerCase().startsWith(q)
    );
  }


}