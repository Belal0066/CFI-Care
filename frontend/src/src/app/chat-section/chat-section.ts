import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, OnInit, OnDestroy, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { AiChatService } from '../services/ai-chat/ai-chat.service';


type ChatMessage = {
  text?: string;
  type: 'incoming' | 'outgoing' | 'error';
  files?: { name: string; url: string; type: string }[];
  liked?: boolean | null;
  confidence?: number;
  citations?: { title: string; url: string }[];
  isStreaming?: boolean;
};


@Component({
  selector: 'app-chat-section',
  imports: [FormsModule, CommonModule],
  templateUrl: './chat-section.html',
  styleUrls: ['./chat-section.css']
})
export class ChatSection implements OnInit, OnDestroy {
  @Input() showChatbot = false;
  @Output() close = new EventEmitter<void>();
  @ViewChild('chatWindow', { static: false }) chatWindow!: ElementRef<HTMLElement>;
  @ViewChild('fileInput', { static: false }) fileInput!: ElementRef<HTMLInputElement>;

  private aiChat = inject(AiChatService);
  private streamSub?: Subscription;

  userMessage = '';
  isRecording = false;
  attachments: { name: string; url: string; type: string; id: string }[] = [];
  messages: ChatMessage[] = [];

  isMaximized = false;

  responseModes = ['Auto', 'MCP', 'RAG'];
  activeMode = 'Auto';

  private modeMap: Record<string, string> = {
    'Auto': 'auto',
    'MCP':  'mcp',
    'RAG':  'rag'
  };

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

        this.isMaximized = true;
        const host = document.querySelector('app-chat-section');
        if (host) host.classList.add('maximized');

        this.messages.push({
          type: 'incoming',
          text: `Branched from session "${originId}" at message ${fromPoint}. Continue from here independently.`
        });

        this.scrollToBottom();
      } catch {
        console.warn('Failed to restore forked session.');
      }
    }
  }

  ngOnDestroy() {
    this.streamSub?.unsubscribe();
  }

  private buildHistory(): { role: 'user' | 'assistant'; content: string }[] {
    return this.messages
      .filter(m => m.type !== 'error' && !m.isStreaming && m.text)
      .map(m => ({
        role: (m.type === 'outgoing' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.text!
      }));
  }

  private parseCitations(contextItems: any[]): { title: string; url: string }[] {
    return contextItems.map((c: any) => {
      const raw = c.content ?? '';
      const urlMatch  = raw.match(/'url':\s*'(https?:\/\/[^']+)'/);
      const titleMatch = raw.match(/'title':\s*'([^']+)'/);
      return {
        title: titleMatch?.[1] ?? c.source ?? 'Source',
        url:   urlMatch?.[1] ?? ''
      };
    });
  }

  sendMessage() {
    const trimmed = (this.userMessage || '').trim();
    if (!trimmed && this.attachments.length === 0) return;

    // Snapshot history BEFORE pushing the new outgoing message
    const history = this.buildHistory();

    const outgoingFiles = this.attachments.length > 0 ? [...this.attachments] : undefined;
    this.messages.push({ text: trimmed || undefined, type: 'outgoing', files: outgoingFiles });

    // Auto-title the session from the first user message
    const currentSession = this.sessions.find(s => s.id === this.activeSessionId);
    if (currentSession && (currentSession.title === 'New Chat' || currentSession.title === 'Session 1')) {
      currentSession.title = trimmed.length > 27 ? trimmed.slice(0, 27) + '…' : trimmed;
      this.filteredSessions = [...this.sessions];
    }
    this.attachments = [];
    this.userMessage = '';

    const placeholder: ChatMessage = { text: '', type: 'incoming', isStreaming: true };
    this.messages.push(placeholder);
    this.scrollToBottom();

    this.streamSub?.unsubscribe();
    this.streamSub = this.aiChat.streamChat({
      query: trimmed,
      history,
      mode: this.modeMap[this.activeMode] ?? 'auto',
      score_threshold: 0.65,
      top_k: 5,
      temperature: 0.2
    }).subscribe({
      next: event => {
        if (event.type === 'token') {
          placeholder.text = (placeholder.text ?? '') + event.content;
          this.scrollToBottom();
        } else if (event.type === 'context' && Array.isArray(event.content) && event.content.length > 0) {
          placeholder.citations = this.parseCitations(event.content);
        }
      },
      error: () => {
        placeholder.text = 'Failed to get a response. Please try again.';
        placeholder.type = 'error';
        placeholder.isStreaming = false;
        this.scrollToBottom();
      },
      complete: () => {
        placeholder.isStreaming = false;
        this.scrollToBottom();
      }
    });

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
    this.finalVoiceTranscript = this.userMessage;

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
    const messagesBefore = this.messages.slice(0, index);
    const reversedIndex = [...messagesBefore].reverse().findIndex(m => m.type === 'outgoing');
    if (reversedIndex === -1) return;

    const userMsgIndex = messagesBefore.length - 1 - reversedIndex;
    const userQuery = messagesBefore[userMsgIndex]?.text;
    if (!userQuery) return;

    const history = messagesBefore
      .slice(0, userMsgIndex)
      .filter(m => m.type !== 'error' && !m.isStreaming && m.text)
      .map(m => ({
        role: (m.type === 'outgoing' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.text!
      }));

    const placeholder: ChatMessage = { text: '', type: 'incoming', isStreaming: true };
    this.messages.splice(index, 1, placeholder);

    this.streamSub?.unsubscribe();
    this.streamSub = this.aiChat.streamChat({
      query: userQuery,
      history,
      mode: this.modeMap[this.activeMode] ?? 'auto',
      score_threshold: 0.65,
      top_k: 5,
      temperature: 0.2
    }).subscribe({
      next: event => {
        if (event.type === 'token') {
          placeholder.text = (placeholder.text ?? '') + event.content;
          this.scrollToBottom();
        } else if (event.type === 'context' && Array.isArray(event.content) && event.content.length > 0) {
          placeholder.citations = this.parseCitations(event.content);
        }
      },
      error: () => {
        placeholder.text = 'Failed to get a response. Please try again.';
        placeholder.type = 'error';
        placeholder.isStreaming = false;
        this.scrollToBottom();
      },
      complete: () => {
        placeholder.isStreaming = false;
        this.scrollToBottom();
      }
    });
  }

  forkFrom(index: number) {
    // Save current session before switching
    const cur = this.sessions.find(s => s.id === this.activeSessionId);
    if (cur) cur.messages = structuredClone(this.messages);

    // Take full history from start up to and including the branched message
    const forkedMessages = structuredClone(this.messages.slice(0, index + 1));

    // Title from the first user message in this conversation
    const firstUserMsg = forkedMessages.find(m => m.type === 'outgoing');
    const label = firstUserMsg?.text ?? 'Forked';
    const title = '↳ ' + (label.length > 24 ? label.slice(0, 24) + '…' : label);

    const newId = Date.now().toString();
    this.sessions.push({ id: newId, title, date: 'Just now', messages: structuredClone(forkedMessages) });
    this.filteredSessions  = [...this.sessions];
    this.activeSessionId   = newId;
    this.messages          = forkedMessages;
    this.citationsPanelOpen = false;
  }

  deleteMessage(index: number) {
    const start = index > 0 && this.messages[index - 1]?.type === 'outgoing'
      ? index - 1 : index;
    this.messages.splice(start, index - start + 1);
  }

  openCitations(msg: any) {
    this.activeCitations = msg.citations || [];
    this.citationsPanelOpen = true;
  }

  newConversation() {
    const cur = this.sessions.find(s => s.id === this.activeSessionId);
    if (cur) cur.messages = structuredClone(this.messages);

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
    const cur = this.sessions.find(x => x.id === this.activeSessionId);
    if (cur) cur.messages = structuredClone(this.messages);
    this.activeSessionId = id;
    this.messages = structuredClone(s.messages);
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
