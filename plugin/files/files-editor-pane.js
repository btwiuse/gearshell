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
import { FilesInfoPane } from "../../files-info.js?v=20260826.41";

function buildMarkdownHtml(source) {
  if (typeof window.marked?.parse !== "function") return null;
  if (typeof window.DOMPurify?.sanitize !== "function") return null;
  return window.DOMPurify.sanitize(window.marked.parse(source || ""));
}

function ToolButton({ title, onClick, disabled, icon: Icon }) {
  return React.createElement("button", {
    type: "button",
    title,
    "aria-label": title,
    disabled,
    onClick,
  }, React.createElement(Icon, { size: 15, "aria-hidden": true }));
}

function ActionBar({ children }) {
  return React.createElement(
    "div",
    { className: "files-editor-toolbar" },
    React.createElement(
      "div",
      { className: "files-toolbar-actions" },
      children,
    ),
  );
}

function VideoPreview({ url, videoRef }) {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement("video", {
      ref: videoRef,
      src: url,
      controls: true,
      preload: "metadata",
    }),
    document.pictureInPictureEnabled &&
      React.createElement(
        "button",
        {
          type: "button",
          className: "files-pip-button",
          title: "Picture-in-picture",
          "aria-label": "Picture-in-picture",
          onClick: () => videoRef.current?.requestPictureInPicture?.(),
        },
        React.createElement(PictureInPicture2, {
          size: 15,
          "aria-hidden": true,
        }),
      ),
  );
}

function MediaPreview({ preview, selectedPath, videoRef }) {
  return React.createElement(
    "div",
    { className: `files-media-preview ${preview.kind}` },
    preview.kind === "image"
      ? React.createElement("img", {
        src: preview.url,
        alt: selectedPath.split("/").pop() || "Image preview",
      })
      : preview.kind === "audio"
      ? React.createElement("audio", {
        src: preview.url,
        controls: true,
        autoPlay: true,
        preload: "metadata",
      })
      : preview.kind === "video"
      ? VideoPreview({ url: preview.url, videoRef })
      : preview.kind === "pdf"
      ? React.createElement("iframe", {
        src: preview.url,
        title: "PDF preview",
      })
      : React.createElement(
        "p",
        { className: "files-media-unsupported" },
        "Preview is not available for this file type. Use Download to open it.",
      ),
  );
}

function EditorPreviewPane({
  preview,
  selectedPath,
  videoRef,
  onDownload,
  onRename,
  onDelete,
}) {
  return React.createElement(
    React.Fragment,
    null,
    ActionBar({
      children: [
        ToolButton({
          title: "Download file",
          onClick: onDownload,
          icon: Download,
        }),
        ToolButton({ title: "Rename file", onClick: onRename, icon: Pencil }),
        ToolButton({ title: "Delete file", onClick: onDelete, icon: Trash2 }),
      ],
    }),
    MediaPreview({ preview, selectedPath, videoRef }),
  );
}

function BinaryHint() {
  return React.createElement(
    "div",
    { className: "files-editor-empty" },
    React.createElement(FileCode2, { size: 28, "aria-hidden": true }),
    React.createElement(
      "p",
      { className: "files-binary-hint" },
      "Binary file — preview is not available. Use Download to open it.",
    ),
  );
}

function MarkdownPreview({ html }) {
  return React.createElement("div", {
    className: "files-md-preview",
    dangerouslySetInnerHTML: { __html: html },
  });
}

function TextBody(
  { binary, mdPreview, markdownHtml, contents, selectedPath, onChange },
) {
  if (binary) return BinaryHint();
  if (mdPreview && markdownHtml !== null) {
    return MarkdownPreview({ html: markdownHtml });
  }
  return React.createElement("textarea", {
    value: contents,
    spellCheck: false,
    "aria-label": `Contents of ${selectedPath}`,
    onChange: (event) => onChange(event.target.value),
  });
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
  return React.createElement(
    React.Fragment,
    null,
    ActionBar({
      children: [
        !binary && isMarkdown &&
        React.createElement(
          "button",
          {
            type: "button",
            title: mdPreview ? "Show source" : "Render preview",
            "aria-label": mdPreview ? "Show source" : "Render preview",
            "aria-pressed": mdPreview,
            onClick: () => setMdPreview((value) => !value),
          },
          React.createElement(
            mdPreview ? EyeOff : Eye,
            { size: 15, "aria-hidden": true },
          ),
        ),
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
    }),
    TextBody({
      binary,
      mdPreview,
      markdownHtml,
      contents,
      selectedPath,
      onChange,
    }),
  );
}

function EmptyPane() {
  return React.createElement(
    "div",
    { className: "files-editor-empty" },
    React.createElement(FileCode2, { size: 28, "aria-hidden": true }),
  );
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
  return React.createElement(FilesInfoPane, {
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
  });
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
  return React.createElement(
    "section",
    { className: "files-editor" },
    body,
    status &&
      React.createElement(
        "div",
        { className: "files-status", role: "status" },
        status,
      ),
  );
}
