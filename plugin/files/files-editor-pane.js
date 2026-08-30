// files-editor-pane.js — the Files panel editor pane: media preview,
// markdown render toggle, text editor + toolbar. Split out of
// files-parts.js for the 500-line rule; the pane itself is composed of
// small render helpers so every function stays under the 50-line rule.

import React, { useEffect, useRef, useState } from "react";
import {
  Download,
  Eye,
  EyeOff,
  FileCode2,
  Pencil,
  PictureInPicture2,
  Save,
  Trash2,
} from "lucide-react";
import { FilesInfoPane } from "./files-info.js";
import htm from "htm";

const html = htm.bind(React.createElement);

function buildMarkdownHtml(source) {
  if (typeof window.marked?.parse !== "function") return null;
  if (typeof window.DOMPurify?.sanitize !== "function") return null;
  return window.DOMPurify.sanitize(window.marked.parse(source || ""));
}

function ToolButton({ title, onClick, disabled, icon: Icon }) {
  return html`
    <button
      type="button"
      title=${title}
      aria-label=${title}
      disabled=${disabled}
      onClick=${onClick}
    >
      <${Icon} size=${15} aria-hidden=${true}/>
    </button>
  `;
}

function ActionBar({ children }) {
  return html`
    <div className="files-editor-toolbar">
      <div className="files-toolbar-actions">${children}</div>
    </div>
  `;
}

function VideoPreview({ url, videoRef }) {
  return html`
    <${React.Fragment}>
      <video ref=${videoRef} src=${url} controls=${true} preload="metadata"></video>
      ${document.pictureInPictureEnabled &&
        html`
          <button
            type="button"
            className="files-pip-button"
            title="Picture-in-picture"
            aria-label="Picture-in-picture"
            onClick=${() => videoRef.current?.requestPictureInPicture?.()}
          >
            <${PictureInPicture2} size=${15} aria-hidden=${true}/>
          </button>
        `}
    </${React.Fragment}>
  `;
}

function MediaPreview({ preview, selectedPath, videoRef }) {
  return html`
    <div className=${`files-media-preview ${preview.kind}`}>
      ${preview.kind === "image"
        ? html`<img src=${preview.url} alt=${selectedPath.split("/").pop() || "Image preview"}/>`
        : preview.kind === "audio"
        ? html`<audio src=${preview.url} controls=${true} autoPlay=${true} preload="metadata"></audio>`
        : preview.kind === "video"
        ? VideoPreview({ url: preview.url, videoRef })
        : preview.kind === "pdf"
        ? html`<iframe src=${preview.url} title="PDF preview"></iframe>`
        : html`<p className="files-media-unsupported">Preview is not available for this file type. Use Download to open it.</p>`}
    </div>
  `;
}

function EditorPreviewPane({
  preview,
  selectedPath,
  videoRef,
  onDownload,
  onRename,
  onDelete,
}) {
  return html`
    <${React.Fragment}>
      ${ActionBar({
        children: [
          ToolButton({
            title: "Download file",
            onClick: onDownload,
            icon: Download,
          }),
          ToolButton({ title: "Rename file", onClick: onRename, icon: Pencil }),
          ToolButton({ title: "Delete file", onClick: onDelete, icon: Trash2 }),
        ],
      })}
      ${MediaPreview({ preview, selectedPath, videoRef })}
    </${React.Fragment}>
  `;
}

function BinaryHint() {
  return html`
    <div className="files-editor-empty">
      <${FileCode2} size=${28} aria-hidden=${true}/>
      <p className="files-binary-hint">Binary file — preview is not available. Use Download to open it.</p>
    </div>
  `;
}

function MarkdownPreview({ html }) {
  return html`
    <div className="files-md-preview" dangerouslySetInnerHTML=${{ __html: html }}></div>
  `;
}

function TextBody(
  { binary, mdPreview, markdownHtml, contents, selectedPath, onChange },
) {
  if (binary) return BinaryHint();
  if (mdPreview && markdownHtml !== null) {
    return MarkdownPreview({ html: markdownHtml });
  }
  return html`
    <textarea
      value=${contents}
      spellCheck=${false}
      aria-label=${`Contents of ${selectedPath}`}
      onChange=${(event) => onChange(event.target.value)}
    ></textarea>
  `;
}

function TextEditorPane({
  isMarkdown,
  mdPreview,
  setMdPreview,
  markdownHtml,
  contents,
  dirty,
  binary,
  selectedPath,
  onSave,
  onDownload,
  onRename,
  onDelete,
  onChange,
}) {
  return html`
    <${React.Fragment}>
      ${ActionBar({
        children: [
          !binary && isMarkdown &&
          html`
            <button
              type="button"
              title=${mdPreview ? "Show source" : "Render preview"}
              aria-label=${mdPreview ? "Show source" : "Render preview"}
              aria-pressed=${mdPreview}
              onClick=${() => setMdPreview((value) => !value)}
            >
              <${mdPreview ? EyeOff : Eye} size=${15} aria-hidden=${true}/>
            </button>
          `,
          ToolButton({
            title: "Save file",
            onClick: onSave,
            disabled: !dirty,
            icon: Save,
          }),
          ToolButton({
            title: "Download file",
            onClick: onDownload,
            icon: Download,
          }),
          ToolButton({ title: "Rename file", onClick: onRename, icon: Pencil }),
          ToolButton({ title: "Delete file", onClick: onDelete, icon: Trash2 }),
        ],
      })}
      ${TextBody({
        binary,
        mdPreview,
        markdownHtml,
        contents,
        selectedPath,
        onChange,
      })}
    </${React.Fragment}>
  `;
}

function EmptyPane() {
  return html`
    <div className="files-editor-empty">
      <${FileCode2} size=${28} aria-hidden=${true}/>
    </div>
  `;
}

function renderInfoPane(
  {
    info,
    onOpenChild,
    onSelectChild,
    finePointer,
    viewMode,
    onViewModeChange,
    sort,
    onSortChange,
    columnWidths,
    onColumnWidthChange,
  },
) {
  return html`
    <${FilesInfoPane}
      info=${info}
      onOpenChild=${onOpenChild}
      onSelectChild=${onSelectChild}
      finePointer=${finePointer}
      viewMode=${viewMode}
      onViewModeChange=${onViewModeChange}
      sort=${sort}
      onSortChange=${onSortChange}
      columnWidths=${columnWidths}
      onColumnWidthChange=${onColumnWidthChange}
    />
  `;
}

function renderEditorBody({
  selectedPath,
  preview,
  contents,
  dirty,
  binary,
  info,
  isMarkdown,
  mdPreview,
  setMdPreview,
  markdownHtml,
  videoRef,
  onDownload,
  onSave,
  onRename,
  onDelete,
  onChange,
  finePointer,
  onSelectChild,
  onOpenChild,
  viewMode,
  onViewModeChange,
  sort,
  onSortChange,
  columnWidths,
  onColumnWidthChange,
}) {
  return selectedPath
    ? preview
      ? EditorPreviewPane({
        preview,
        selectedPath,
        videoRef,
        onDownload,
        onRename,
        onDelete,
      })
      : TextEditorPane({
        isMarkdown,
        mdPreview,
        setMdPreview,
        markdownHtml,
        contents,
        dirty,
        binary,
        selectedPath,
        onSave,
        onDownload,
        onRename,
        onDelete,
        onChange,
      })
    : info
    ? renderInfoPane({
      info,
      onOpenChild,
      onSelectChild,
      finePointer,
      viewMode,
      onViewModeChange,
      sort,
      onSortChange,
      columnWidths,
      onColumnWidthChange,
    })
    : EmptyPane();
}

export function FilesEditorPane(props) {
  const { selectedPath, contents, status } = props;
  const isMarkdown = !!selectedPath && /\.(md|markdown)$/i.test(selectedPath);
  const [mdPreview, setMdPreview] = useState(false);
  useEffect(() => setMdPreview(false), [selectedPath]);
  const markdownHtml = mdPreview ? buildMarkdownHtml(contents) : null;
  const videoRef = useRef(null);
  const body = renderEditorBody({
    ...props,
    isMarkdown,
    mdPreview,
    setMdPreview,
    markdownHtml,
    videoRef,
  });
  return html`
    <section className="files-editor">
      ${body}
      ${status &&
        html`<div className="files-status" role="status">${status}</div>`}
    </section>
  `;
}
