/**
 * PDF Export Service
 *
 * Generates PDF-ready content from transcripts and comic layouts.
 * Returns HTML that can be rendered to PDF by the client or a server-side library.
 */

import type { Transcript, TranscriptSection, TranscriptEntry } from './types.js';
import type { ComicLayout, ComicPage, ComicPanel, PDFExportOptions } from './types.js';

/**
 * Default PDF export options
 */
const DEFAULT_OPTIONS: PDFExportOptions = {
  pageSize: 'letter',
  orientation: 'portrait',
  includeCover: true,
  includeTOC: true,
};

/**
 * Page size key type
 */
type PageSizeKey = 'letter' | 'a4' | 'comic';

/**
 * Page dimensions in points (72 points = 1 inch)
 */
const PAGE_SIZES: Record<PageSizeKey, { width: number; height: number }> = {
  letter: { width: 612, height: 792 },
  a4: { width: 595, height: 842 },
  comic: { width: 432, height: 648 }, // 6" x 9"
};

/**
 * Service for generating PDF-ready exports
 */
export class PDFExportService {
  /**
   * Generate HTML for transcript PDF
   */
  transcriptToHTML(transcript: Transcript, options?: Partial<PDFExportOptions>): string {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const pageSize = PAGE_SIZES[opts.pageSize as PageSizeKey];

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(transcript.gameName)} - Transcript</title>
  <style>
    @page {
      size: ${opts.pageSize} ${opts.orientation};
      margin: 1in;
    }

    * {
      box-sizing: border-box;
    }

    body {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 12pt;
      line-height: 1.6;
      color: #333;
      max-width: ${pageSize.width - 144}pt;
      margin: 0 auto;
      padding: 20px;
    }

    /* Cover page */
    .cover-page {
      page-break-after: always;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      min-height: 80vh;
      text-align: center;
    }

    .cover-title {
      font-size: 28pt;
      font-weight: bold;
      margin-bottom: 20pt;
    }

    .cover-subtitle {
      font-size: 14pt;
      color: #666;
      margin-bottom: 40pt;
    }

    .cover-meta {
      font-size: 10pt;
      color: #999;
    }

    /* Table of contents */
    .toc {
      page-break-after: always;
    }

    .toc h2 {
      font-size: 18pt;
      border-bottom: 2px solid #333;
      padding-bottom: 10pt;
      margin-bottom: 20pt;
    }

    .toc-entry {
      display: flex;
      justify-content: space-between;
      margin: 8pt 0;
    }

    .toc-title {
      flex: 1;
    }

    .toc-dots {
      flex: 1;
      border-bottom: 1px dotted #ccc;
      margin: 0 10pt;
    }

    .toc-page {
      min-width: 30pt;
      text-align: right;
    }

    /* Sections */
    .section {
      page-break-before: always;
    }

    .section:first-of-type {
      page-break-before: auto;
    }

    .section-header {
      font-size: 18pt;
      font-weight: bold;
      border-bottom: 1px solid #ccc;
      padding-bottom: 10pt;
      margin-bottom: 20pt;
    }

    .section-meta {
      font-size: 10pt;
      color: #666;
      font-style: italic;
      margin-bottom: 20pt;
    }

    /* Entries */
    .entry {
      margin-bottom: 12pt;
    }

    .entry-dialogue {
      margin-left: 20pt;
    }

    .entry-dialogue .speaker {
      font-weight: bold;
    }

    .entry-narration {
      font-style: italic;
      color: #444;
    }

    .entry-environment {
      font-size: 10pt;
      color: #666;
      text-align: center;
      margin: 20pt 0;
      padding: 10pt;
      border-top: 1px solid #eee;
      border-bottom: 1px solid #eee;
    }

    .entry-dm {
      background: #f5f5f5;
      padding: 10pt;
      border-left: 3px solid #999;
      margin: 15pt 0;
    }

    /* Turn markers */
    .turn-marker {
      font-size: 8pt;
      color: #999;
      margin-right: 5pt;
    }

    /* Print-specific */
    @media print {
      body {
        padding: 0;
      }

      .no-print {
        display: none;
      }
    }
  </style>
</head>
<body>
  ${opts.includeCover ? this.generateCoverPage(transcript) : ''}
  ${opts.includeTOC && transcript.sections.length > 1 ? this.generateTOC(transcript) : ''}
  ${transcript.sections.map((section, index) => this.generateSection(section, index)).join('\n')}
</body>
</html>`;

    return html;
  }

  /**
   * Generate HTML for comic PDF
   */
  comicToHTML(layout: ComicLayout, options?: Partial<PDFExportOptions>): string {
    const opts = { ...DEFAULT_OPTIONS, pageSize: 'comic' as PageSizeKey, ...options };
    const pageSize = PAGE_SIZES[opts.pageSize as PageSizeKey];

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(layout.gameName)} - Comic</title>
  <style>
    @page {
      size: ${opts.pageSize};
      margin: 0.5in;
    }

    * {
      box-sizing: border-box;
    }

    body {
      font-family: 'Comic Sans MS', 'Chalkboard SE', sans-serif;
      margin: 0;
      padding: 0;
      background: #f0f0f0;
    }

    .page {
      width: ${pageSize.width - 72}pt;
      height: ${pageSize.height - 72}pt;
      margin: 20pt auto;
      background: white;
      page-break-after: always;
      position: relative;
      display: flex;
      flex-direction: column;
      padding: 10pt;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }

    /* Chapter title pages */
    .chapter-page {
      display: flex;
      justify-content: center;
      align-items: center;
      text-align: center;
    }

    .chapter-title {
      font-size: 24pt;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 2pt;
    }

    /* Panel layouts */
    .panel-container {
      display: grid;
      gap: 8pt;
      flex: 1;
    }

    .layout-single {
      grid-template-columns: 1fr;
      grid-template-rows: 1fr;
    }

    .layout-half {
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr;
    }

    .layout-thirds {
      grid-template-columns: 1fr 1fr 1fr;
      grid-template-rows: 1fr;
    }

    .layout-quarter {
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr 1fr;
    }

    .layout-feature {
      grid-template-columns: 2fr 1fr;
      grid-template-rows: 1fr;
    }

    .layout-strip {
      grid-template-columns: repeat(4, 1fr);
      grid-template-rows: 1fr;
    }

    /* Individual panels */
    .panel {
      border: 2pt solid #000;
      background: #fff;
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .panel-content {
      flex: 1;
      padding: 8pt;
      display: flex;
      flex-direction: column;
      justify-content: center;
      background: linear-gradient(135deg, #fafafa 0%, #f0f0f0 100%);
    }

    .panel-description {
      font-size: 8pt;
      color: #666;
      font-style: italic;
      text-align: center;
      padding: 4pt;
      background: #f5f5f5;
    }

    .panel-narration {
      font-size: 9pt;
      background: #fff8dc;
      padding: 6pt;
      margin: 4pt;
      border: 1pt solid #e6d5a8;
      text-align: center;
    }

    /* Speech bubbles */
    .speech-bubble {
      background: white;
      border: 2pt solid #000;
      border-radius: 15pt;
      padding: 8pt 12pt;
      margin: 4pt;
      position: relative;
      max-width: 80%;
    }

    .speech-bubble::after {
      content: '';
      position: absolute;
      bottom: -10pt;
      left: 20pt;
      border-width: 10pt 8pt 0;
      border-style: solid;
      border-color: #000 transparent;
    }

    .speech-bubble::before {
      content: '';
      position: absolute;
      bottom: -7pt;
      left: 22pt;
      border-width: 8pt 6pt 0;
      border-style: solid;
      border-color: #fff transparent;
    }

    .speaker-name {
      font-weight: bold;
      font-size: 8pt;
      text-transform: uppercase;
      margin-bottom: 2pt;
      color: #333;
    }

    .dialogue-text {
      font-size: 10pt;
    }

    /* Page numbers */
    .page-number {
      position: absolute;
      bottom: 5pt;
      right: 10pt;
      font-size: 8pt;
      color: #999;
    }

    @media print {
      body {
        background: white;
      }

      .page {
        box-shadow: none;
        margin: 0;
      }
    }
  </style>
</head>
<body>
  ${opts.includeCover ? this.generateComicCoverPage(layout) : ''}
  ${layout.pages.map(page => this.generateComicPage(page)).join('\n')}
</body>
</html>`;

    return html;
  }

  /**
   * Generate cover page HTML for transcript
   */
  private generateCoverPage(transcript: Transcript): string {
    return `
  <div class="cover-page">
    <div class="cover-title">${this.escapeHtml(transcript.gameName)}</div>
    <div class="cover-subtitle">Game Transcript</div>
    <div class="cover-meta">
      <p>Exported: ${new Date(transcript.exportedAt).toLocaleDateString()}</p>
      <p>${transcript.totalEvents} events across ${transcript.sections.length} scenes</p>
    </div>
  </div>`;
  }

  /**
   * Generate comic cover page HTML
   */
  private generateComicCoverPage(layout: ComicLayout): string {
    return `
  <div class="page chapter-page">
    <div>
      <div class="chapter-title">${this.escapeHtml(layout.gameName)}</div>
      <p style="margin-top: 20pt; color: #666;">A visual chronicle</p>
    </div>
    <div class="page-number">i</div>
  </div>`;
  }

  /**
   * Generate table of contents HTML
   */
  private generateTOC(transcript: Transcript): string {
    let pageNum = 1;
    if (transcript.sections.length > 1) pageNum++; // After cover

    const entries = transcript.sections.map((section, index) => {
      const entry = `
    <div class="toc-entry">
      <span class="toc-title">${this.escapeHtml(section.title)}</span>
      <span class="toc-dots"></span>
      <span class="toc-page">${pageNum + index}</span>
    </div>`;
      return entry;
    });

    return `
  <div class="toc">
    <h2>Table of Contents</h2>
    ${entries.join('\n')}
  </div>`;
  }

  /**
   * Generate section HTML for transcript
   */
  private generateSection(section: TranscriptSection, _index: number): string {
    const meta: string[] = [];
    if (section.sceneType) meta.push(section.sceneType);
    if (section.mood) meta.push(`Mood: ${section.mood}`);
    if (section.stakes) meta.push(`Stakes: ${section.stakes}`);

    return `
  <div class="section">
    <h2 class="section-header">${this.escapeHtml(section.title)}</h2>
    ${meta.length > 0 ? `<div class="section-meta">${this.escapeHtml(meta.join(' | '))}</div>` : ''}
    ${section.entries.map(entry => this.generateEntry(entry)).join('\n')}
  </div>`;
  }

  /**
   * Generate entry HTML for transcript
   */
  private generateEntry(entry: TranscriptEntry): string {
    switch (entry.eventType) {
      case 'party_dialogue':
      case 'npc_dialogue':
        return `
    <div class="entry entry-dialogue">
      <span class="speaker">${this.escapeHtml(entry.speaker || 'Unknown')}:</span>
      "${this.escapeHtml(entry.content)}"
    </div>`;

      case 'narration':
        return `
    <div class="entry entry-narration">
      ${this.escapeHtml(entry.content)}
    </div>`;

      case 'environment':
        return `
    <div class="entry entry-environment">
      ${this.escapeHtml(entry.content)}
    </div>`;

      case 'dm_injection':
        return `
    <div class="entry entry-dm">
      ${this.escapeHtml(entry.content)}
    </div>`;

      default:
        return `
    <div class="entry">
      ${this.escapeHtml(entry.content)}
    </div>`;
    }
  }

  /**
   * Generate comic page HTML
   */
  private generateComicPage(page: ComicPage): string {
    // Chapter title page
    if (page.chapterTitle && page.panels.length === 0) {
      return `
  <div class="page chapter-page">
    <div class="chapter-title">${this.escapeHtml(page.chapterTitle)}</div>
    <div class="page-number">${page.pageNumber}</div>
  </div>`;
    }

    // Regular page with panels
    return `
  <div class="page">
    ${page.chapterTitle ? `<div style="text-align: center; margin-bottom: 10pt; font-weight: bold;">${this.escapeHtml(page.chapterTitle)}</div>` : ''}
    <div class="panel-container layout-${page.layout}">
      ${page.panels.map(panel => this.generatePanel(panel)).join('\n')}
    </div>
    <div class="page-number">${page.pageNumber}</div>
  </div>`;
  }

  /**
   * Generate comic panel HTML
   */
  private generatePanel(panel: ComicPanel): string {
    const dialogueHtml = panel.dialogue
      ? `
      <div class="speech-bubble">
        <div class="speaker-name">${this.escapeHtml(panel.dialogue.speaker)}</div>
        <div class="dialogue-text">${this.escapeHtml(panel.dialogue.text)}</div>
      </div>`
      : '';

    // For panels without dialogue, show narration
    const narrationHtml = !panel.dialogue && panel.content
      ? `<div class="panel-narration">${this.escapeHtml(this.truncateText(panel.content, 150))}</div>`
      : '';

    return `
      <div class="panel">
        <div class="panel-content">
          ${dialogueHtml}
          ${narrationHtml}
        </div>
        <div class="panel-description">${this.escapeHtml(this.truncateText(panel.description, 100))}</div>
      </div>`;
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const escapeMap: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return text.replace(/[&<>"']/g, (char: string) => escapeMap[char] || char);
  }

  /**
   * Truncate text to a maximum length
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
  }
}
