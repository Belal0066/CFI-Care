import { Component, Input, Output, EventEmitter, ViewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-chat-section',
  imports: [FormsModule, CommonModule],
  templateUrl: './chat-section.html',
  styleUrls: ['./chat-section.css']
})
export class ChatSection {
  @Input() showChatbot = false;
  @Output() close = new EventEmitter<void>();
  @ViewChild('chatWindow', { static: false }) chatWindow!: ElementRef<HTMLElement>;
  @ViewChild('fileInput', { static: false }) fileInput!: ElementRef<HTMLInputElement>;

  userMessage = '';
  isRecording = false;
  attachments: { name: string; url: string; type: string; id: string }[] = [];
  messages: { text?: string, type: 'incoming' | 'outgoing' | 'error', files?: { name: string, url: string, type: string }[] }[] = [];

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

  sendMessage() {
    const trimmed = (this.userMessage || '').trim();
    if (!trimmed && this.attachments.length === 0) return;

    const outgoingFiles = this.attachments.length > 0 ? [...this.attachments] : undefined;
    this.messages.push({ text: trimmed || undefined, type: 'outgoing', files: outgoingFiles });
    this.attachments = [];
    this.userMessage = '';

    const temp = { text: 'Analyzing…', type: 'incoming' as const };
    this.messages.push(temp);
    this.scrollToBottom();

    setTimeout(() => {
      temp.text = this.sampleResponse;
      this.scrollToBottom();
    }, 900);
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
}