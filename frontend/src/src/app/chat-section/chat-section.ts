import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, OnInit, OnDestroy, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { AiChatService } from '../services/ai-chat/ai-chat.service';


type ConfidenceScore = { label: string; value: number; level: string; textValue?: string };

type ChatMessage = {
  text?: string;
  renderedHtml?: string;
  thoughtHtml?: string;
  confidenceScores?: ConfidenceScore[];
  type: 'incoming' | 'outgoing' | 'error';
  files?: { name: string; url: string; type: string }[];
  liked?: boolean | null;
  confidence?: number;
  citations?: { title: string; url: string; summary?: string }[];
  isStreaming?: boolean;
  streamWords?: string[];
  streamBuffer?: string;
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

  ingestState: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  private ingestResetTimer?: ReturnType<typeof setTimeout>;

  runIngest() {
    if (this.ingestState === 'loading') return;
    clearTimeout(this.ingestResetTimer);
    this.ingestState = 'loading';

    fetch('/ai/ingest', { method: 'POST' })
      .then(r => {
        this.ingestState = r.ok ? 'success' : 'error';
      })
      .catch(() => {
        this.ingestState = 'error';
      })
      .finally(() => {
        this.ingestResetTimer = setTimeout(() => { this.ingestState = 'idle'; }, 3000);
      });
  }

  isBranch = false;
  branchOriginId = '';
  branchFromPoint = 0;

  citationsPanelOpen = false;
  activeCitations: { title: string; url: string; summary?: string }[] = [];

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
    clearTimeout(this.ingestResetTimer);
  }

  private buildHistory(): { role: 'user' | 'assistant'; content: string }[] {
    return this.messages
      .filter(m => m.type !== 'error' && !m.isStreaming && m.text)
      .map(m => ({
        role: (m.type === 'outgoing' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.text!
      }));
  }

  private parseCitations(contextItems: any[]): { title: string; url: string; summary?: string }[] {
    return contextItems.map((c: any) => {
      const raw = c.content ?? '';
      const urlMatch   = raw.match(/'url':\s*'(https?:\/\/[^']+)'/);
      const titleMatch = raw.match(/'title':\s*'([^']+)'/);
      const summaryMatch = raw.match(/\*\*Summary:\*\*\s*([\s\S]*?)(?:\n\n|\*\*Source Detail|$)/);
      return {
        title:   titleMatch?.[1] ?? c.title ?? c.source ?? 'Source',
        url:     urlMatch?.[1] ?? c.url ?? '',
        summary: summaryMatch?.[1]?.trim() || (raw && !raw.includes('**') ? raw.trim() : undefined)
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
          this.appendStreamWords(placeholder);
          this.scrollToBottom();
        } else if (event.type === 'context' && Array.isArray(event.content) && event.content.length > 0) {
          placeholder.citations = this.parseCitations(event.content);
        }
      },
      error: () => {
        placeholder.text = 'Failed to get a response. Please try again.';
        placeholder.renderedHtml = undefined;
        placeholder.type = 'error';
        placeholder.isStreaming = false;
        this.scrollToBottom();
      },
      complete: () => {
        const { html, thoughtHtml, scores } = this.processResponse(placeholder.text ?? '');
        placeholder.renderedHtml = html;
        placeholder.thoughtHtml  = thoughtHtml;
        placeholder.confidenceScores = scores;
        placeholder.isStreaming = false;
        placeholder.streamWords = undefined;
        placeholder.streamBuffer = undefined;
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
          this.appendStreamWords(placeholder);
          this.scrollToBottom();
        } else if (event.type === 'context' && Array.isArray(event.content) && event.content.length > 0) {
          placeholder.citations = this.parseCitations(event.content);
        }
      },
      error: () => {
        placeholder.text = 'Failed to get a response. Please try again.';
        placeholder.renderedHtml = undefined;
        placeholder.type = 'error';
        placeholder.isStreaming = false;
        this.scrollToBottom();
      },
      complete: () => {
        const { html, thoughtHtml, scores } = this.processResponse(placeholder.text ?? '');
        placeholder.renderedHtml = html;
        placeholder.thoughtHtml  = thoughtHtml;
        placeholder.confidenceScores = scores;
        placeholder.isStreaming = false;
        placeholder.streamWords = undefined;
        placeholder.streamBuffer = undefined;
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

  private processResponse(raw: string): { html: string; thoughtHtml: string; scores: ConfidenceScore[] } {
    let body = raw.trim();
    const scores: ConfidenceScore[] = [];

    // Strip leading "thought" marker emitted by some models
    if (/^thought[\r\n]/.test(body)) {
      body = body.slice(body.indexOf('\n') + 1).trim();
    }

    // Extract and remove Confidence Assessment block
    const confIdx = body.lastIndexOf('*Confidence Assessment:*');
    if (confIdx > -1) {
      const confBlock = body.slice(confIdx);
      body = body.slice(0, confIdx).trim();
      const re = /[-•]\s*\*{0,2}([^:*\n]+?)\*{0,2}:\s*(?:([^\d(]+?)\s*\()?([\d.]+)(?:\s*[-–]\s*|\s+\(?)(\w+)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(confBlock)) !== null) {
        scores.push({ label: m[1].trim(), textValue: m[2]?.trim() || undefined, value: parseFloat(m[3]), level: m[4] });
      }
    }

    // Remove redundant "Cited Responses" block
    const citIdx = body.lastIndexOf('**Cited Responses:**');
    if (citIdx > -1) body = body.slice(0, citIdx).trim();

    // Clean up trailing separators
    body = body.replace(/\n?---+\s*$/, '').trim();

    // Split thought from answer: answer starts at first occurrence of known answer markers
    const answerRe = /(?:Based on the provided context|Final Answer Construction:|According to the provided context|From the provided context)/;
    const splitAt = body.search(answerRe);

    let thoughtHtml = '';
    let answerBody = body;

    if (splitAt > 0) {
      const thoughtText = body.slice(0, splitAt).trim();
      answerBody = body.slice(splitAt).trim();
      if (thoughtText) thoughtHtml = this.renderMarkdown(thoughtText);
    }

    return { html: this.renderMarkdown(answerBody), thoughtHtml, scores };
  }

  trackByIdx(index: number): number { return index; }

  private appendStreamWords(msg: ChatMessage): void {
    const allWords = (msg.text ?? '').match(/\S+\s*/g) ?? [];
    const lastIsPartial = allWords.length > 0 && !/\s$/.test(allWords[allWords.length - 1]);
    const completeWords = lastIsPartial ? allWords.slice(0, -1) : allWords;
    const prevCount = msg.streamWords?.length ?? 0;
    if (completeWords.length > prevCount) {
      msg.streamWords = [...(msg.streamWords ?? []), ...completeWords.slice(prevCount)];
    }
    msg.streamBuffer = lastIsPartial ? allWords[allWords.length - 1] : '';
  }

  boldify(text: string): string {
    return this.inlineFmt(text);
  }

  renderMarkdown(text: string | undefined): string {
    if (!text) return '';

    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const inlineFmt = this.inlineFmt.bind(this);

    const lines = text.split('\n');
    let html = '';
    let inCode = false;
    let inUl  = false;
    let inOl  = false;

    const closeList = () => {
      if (inUl) { html += '</ul>'; inUl = false; }
      if (inOl) { html += '</ol>'; inOl = false; }
    };

    // Peek ahead past blank lines to find the next non-empty line
    const nextNonBlank = (from: number) => {
      let j = from;
      while (j < lines.length && lines[j].trim() === '') j++;
      return j < lines.length ? lines[j].trim() : '';
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // ── fenced code block ───────────────────────────────────────────────
      if (line.startsWith('```')) {
        if (!inCode) {
          closeList();
          const lang = line.slice(3).trim();
          html += `<pre><code${lang ? ` class="language-${lang}"` : ''}>`;
          inCode = true;
        } else {
          html += '</code></pre>';
          inCode = false;
        }
        continue;
      }
      if (inCode) { html += esc(line) + '\n'; continue; }

      // ── headings ────────────────────────────────────────────────────────
      const h3 = line.match(/^### (.+)/);
      const h2 = line.match(/^## (.+)/);
      const h1 = line.match(/^# (.+)/);
      if (h1) { closeList(); html += `<h1>${inlineFmt(h1[1])}</h1>`; continue; }
      if (h2) { closeList(); html += `<h2>${inlineFmt(h2[1])}</h2>`; continue; }
      if (h3) { closeList(); html += `<h3>${inlineFmt(h3[1])}</h3>`; continue; }

      // ── horizontal rule ─────────────────────────────────────────────────
      if (/^---+$/.test(line.trim())) { closeList(); html += '<hr>'; continue; }

      // ── unordered list ──────────────────────────────────────────────────
      const ulm = line.match(/^[\-\*•]\s+(.*)/);
      if (ulm) {
        if (inOl) { html += '</ol>'; inOl = false; }
        if (!inUl) { html += '<ul>'; inUl = true; }
        html += `<li>${inlineFmt(ulm[1])}</li>`;
        continue;
      }

      // ── ordered list ────────────────────────────────────────────────────
      const olm = line.match(/^\d+\.\s+(.*)/);
      if (olm) {
        if (inUl) { html += '</ul>'; inUl = false; }
        if (!inOl) { html += '<ol>'; inOl = true; }
        html += `<li>${inlineFmt(olm[1])}</li>`;
        continue;
      }

      // ── blank line ──────────────────────────────────────────────────────
      if (line.trim() === '') {
        // Don't close a list when blank lines appear between list items
        if (inUl && /^[\-\*•]\s+/.test(nextNonBlank(i + 1))) continue;
        if (inOl && /^\d+\.\s+/.test(nextNonBlank(i + 1))) continue;
        closeList();
        continue;
      }

      // ── paragraph ───────────────────────────────────────────────────────
      closeList();
      html += `<p>${inlineFmt(line)}</p>`;
    }

    closeList();
    if (inCode) html += '</code></pre>';
    return html;
  }

  private inlineFmt(s: string): string {
    s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    s = s.replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>');
    s = s.replace(/\*(.+?)\*/g,         '<em>$1</em>');
    s = s.replace(/_(.+?)_/g,           '<em>$1</em>');
    s = s.replace(/`([^`]+)`/g,         '<code>$1</code>');
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    return s;
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
