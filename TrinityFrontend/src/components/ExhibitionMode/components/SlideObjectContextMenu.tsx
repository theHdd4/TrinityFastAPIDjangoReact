import React, { useCallback, useState } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  Clipboard,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Info,
  Layers,
  Link as LinkIcon,
  Lock,
  MessageSquarePlus,
  Palette,
  Scissors,
  TextCursorInput,
  Trash2,
  Unlock,
  WrapText,
  ArrowUpToLine,
  ArrowDownToLine,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

type AlignAction = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

interface SlideObjectContextMenuProps {
  children: React.ReactNode;
  canEdit: boolean;
  canAlign: boolean;
  canLayer: boolean;
  canApplyColors: boolean;
  canAddAltText: boolean;
  hasClipboard: boolean;
  lockLabel: 'Lock' | 'Unlock';
  onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onCopy: () => void;
  onCopyStyle: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleLock: () => void;
  onBringToFront: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onSendToBack: () => void;
  onAlign: (action: AlignAction) => void;
  onLink: () => void;
  onComment: () => void;
  onAltText: () => void;
  onApplyColorsToAll: () => void;
  onInfo: () => void;
  disableDelete?: boolean;
  disableLock?: boolean;
  disableCopy?: boolean;
  disableCopyStyle?: boolean;
  disableCut?: boolean;
  disableDuplicate?: boolean;
  disableLink?: boolean;
  disableComment?: boolean;
  disableApplyColors?: boolean;
  renderAdditionalContent?: (closeMenu: () => void) => React.ReactNode;
  renderLayerExtras?: (closeMenu: () => void) => React.ReactNode;
}

const SlideObjectContextMenu: React.FC<SlideObjectContextMenuProps> = ({
  children,
  canEdit,
  canAlign,
  canLayer,
  canApplyColors,
  canAddAltText,
  hasClipboard,
  lockLabel,
  onContextMenu,
  onCopy,
  onCopyStyle,
  onCut,
  onPaste,
  onDuplicate,
  onDelete,
  onToggleLock,
  onBringToFront,
  onBringForward,
  onSendBackward,
  onSendToBack,
  onAlign,
  onLink,
  onComment,
  onAltText,
  onApplyColorsToAll,
  onInfo,
  disableDelete = false,
  disableLock = false,
  disableCopy = false,
  disableCopyStyle = false,
  disableCut = false,
  disableDuplicate = false,
  disableLink = false,
  disableComment = false,
  disableApplyColors = false,
  renderAdditionalContent,
  renderLayerExtras,
}) => {
  const [open, setOpen] = useState(false);
  const closeMenu = useCallback(() => setOpen(false), []);

  const handleAlign = useCallback(
    (action: AlignAction) => () => {
      closeMenu();
      onAlign(action);
    },
    [closeMenu, onAlign],
  );

  const additionalContent = renderAdditionalContent?.(closeMenu);
  const layerExtras = renderLayerExtras?.(closeMenu);

  return (
    <ContextMenu open={open} onOpenChange={setOpen}>
      <ContextMenuTrigger asChild>
        <div onContextMenu={onContextMenu}>{children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-64" style={{ zIndex: 9999 }}>
        <ContextMenuItem disabled={!canEdit || disableCopy} onSelect={event => {
          event.preventDefault();
          closeMenu();
          onCopy();
        }}>
          <Copy className="mr-2 h-4 w-4" />
          Copy
          <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem disabled={!canEdit || disableCopyStyle} onSelect={event => {
          event.preventDefault();
          closeMenu();
          onCopyStyle();
        }}>
          <Clipboard className="mr-2 h-4 w-4" />
          Copy style
          <ContextMenuShortcut>Ctrl+Alt+C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem disabled={!canEdit || disableCut} onSelect={event => {
          event.preventDefault();
          closeMenu();
          onCut();
        }}>
          <Scissors className="mr-2 h-4 w-4" />
          Cut
          <ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem disabled={!canEdit || !hasClipboard} onSelect={event => {
          event.preventDefault();
          closeMenu();
          onPaste();
        }}>
          <ClipboardPaste className="mr-2 h-4 w-4" />
          Paste
          <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem disabled={!canEdit || disableDuplicate} onSelect={event => {
          event.preventDefault();
          closeMenu();
          onDuplicate();
        }}>
          <CopyPlus className="mr-2 h-4 w-4" />
          Duplicate
          <ContextMenuShortcut>Ctrl+D</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem disabled={!canEdit || disableDelete} onSelect={event => {
          event.preventDefault();
          closeMenu();
          onDelete();
        }}>
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
          <ContextMenuShortcut>Del</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!canEdit || disableLock} onSelect={event => {
          event.preventDefault();
          closeMenu();
          onToggleLock();
        }}>
          {lockLabel === 'Lock' ? (
            <Lock className="mr-2 h-4 w-4" />
          ) : (
            <Unlock className="mr-2 h-4 w-4" />
          )}
          {lockLabel}
          <ContextMenuShortcut>Alt+Shift+L</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger disabled={!canEdit || !canLayer}>
            <Layers className="mr-2 h-4 w-4" />
            Layer
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-52">
            <ContextMenuItem
              disabled={!canEdit || !canLayer}
              onSelect={event => {
                event.preventDefault();
                closeMenu();
                onBringToFront();
              }}
            >
              <ArrowUpToLine className="mr-2 h-4 w-4" />
              Bring to front
            </ContextMenuItem>
            <ContextMenuItem
              disabled={!canEdit || !canLayer}
              onSelect={event => {
                event.preventDefault();
                closeMenu();
                onBringForward();
              }}
            >
              <ArrowUp className="mr-2 h-4 w-4" />
              Bring forward
            </ContextMenuItem>
            <ContextMenuItem
              disabled={!canEdit || !canLayer}
              onSelect={event => {
                event.preventDefault();
                closeMenu();
                onSendBackward();
              }}
            >
              <ArrowDown className="mr-2 h-4 w-4" />
              Send backward
            </ContextMenuItem>
            <ContextMenuItem
              disabled={!canEdit || !canLayer}
              onSelect={event => {
                event.preventDefault();
                closeMenu();
                onSendToBack();
              }}
            >
              <ArrowDownToLine className="mr-2 h-4 w-4" />
              Send to back
            </ContextMenuItem>
            {layerExtras}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSub>
          <ContextMenuSubTrigger disabled={!canEdit || !canAlign}>
            <WrapText className="mr-2 h-4 w-4" />
            Align
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-52">
            <ContextMenuItem
              disabled={!canEdit || !canAlign}
              onSelect={event => {
                event.preventDefault();
                handleAlign('left')();
              }}
            >
              <AlignStartHorizontal className="mr-2 h-4 w-4" />
              Left
            </ContextMenuItem>
            <ContextMenuItem
              disabled={!canEdit || !canAlign}
              onSelect={event => {
                event.preventDefault();
                handleAlign('center')();
              }}
            >
              <AlignCenterHorizontal className="mr-2 h-4 w-4" />
              Center
            </ContextMenuItem>
            <ContextMenuItem
              disabled={!canEdit || !canAlign}
              onSelect={event => {
                event.preventDefault();
                handleAlign('right')();
              }}
            >
              <AlignEndHorizontal className="mr-2 h-4 w-4" />
              Right
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              disabled={!canEdit || !canAlign}
              onSelect={event => {
                event.preventDefault();
                handleAlign('top')();
              }}
            >
              <AlignStartVertical className="mr-2 h-4 w-4" />
              Top
            </ContextMenuItem>
            <ContextMenuItem
              disabled={!canEdit || !canAlign}
              onSelect={event => {
                event.preventDefault();
                handleAlign('middle')();
              }}
            >
              <AlignCenterVertical className="mr-2 h-4 w-4" />
              Middle
            </ContextMenuItem>
            <ContextMenuItem
              disabled={!canEdit || !canAlign}
              onSelect={event => {
                event.preventDefault();
                handleAlign('bottom')();
              }}
            >
              <AlignEndVertical className="mr-2 h-4 w-4" />
              Bottom
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!canEdit || disableLink} onSelect={event => {
          event.preventDefault();
          closeMenu();
          onLink();
        }}>
          <LinkIcon className="mr-2 h-4 w-4" />
          Link
          <ContextMenuShortcut>Ctrl+K</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem disabled={!canEdit || disableComment} onSelect={event => {
          event.preventDefault();
          closeMenu();
          onComment();
        }}>
          <MessageSquarePlus className="mr-2 h-4 w-4" />
          Comment
          <ContextMenuShortcut>Ctrl+Alt+N</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem disabled={!canEdit || !canAddAltText} onSelect={event => {
          event.preventDefault();
          closeMenu();
          onAltText();
        }}>
          <TextCursorInput className="mr-2 h-4 w-4" />
          Alternative text
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!canEdit || !canApplyColors || disableApplyColors}
          onSelect={event => {
            event.preventDefault();
            closeMenu();
            onApplyColorsToAll();
          }}
        >
          <Palette className="mr-2 h-4 w-4" />
          Apply colors to all
        </ContextMenuItem>
        {additionalContent ? (
          <>
            <ContextMenuSeparator />
            {additionalContent}
          </>
        ) : null}
        <ContextMenuItem onSelect={event => {
          event.preventDefault();
          closeMenu();
          onInfo();
        }}>
          <Info className="mr-2 h-4 w-4" />
          Info
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export type { AlignAction };
export default SlideObjectContextMenu;
