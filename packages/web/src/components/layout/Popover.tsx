import { type ReactNode, useState } from 'react';
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useClick,
  useHover,
  useDismiss,
  useRole,
  useInteractions,
  FloatingFocusManager,
  FloatingPortal,
  type Placement,
} from '@floating-ui/react';

interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Render the trigger element — attach ref and props (positioning, events, aria-expanded/-haspopup/-controls, data-popover-pinned) */
  renderTrigger: (
    ref: (el: HTMLElement | null) => void,
    props: Record<string, unknown>,
  ) => ReactNode;
  children: ReactNode;
  /** Accessible name of the popover (it is a non-modal dialog) */
  label: string;
  placement?: Placement;
  /** Also open as a preview while a mouse rests on the trigger. A click, tap, Enter or Space always toggles it. */
  hover?: boolean;
  className?: string;
}

export function Popover({
  open,
  onOpenChange,
  renderTrigger,
  children,
  label,
  placement = 'bottom-start',
  hover = false,
  className = '',
}: PopoverProps) {
  // A hover preview leaves focus where it is; a click, tap or key moves focus
  // into the popover, so a screen reader reads it there.
  const [openedByHover, setOpenedByHover] = useState(false);
  const { refs: { setReference, setFloating }, floatingStyles, context } = useFloating({
    open,
    onOpenChange: (nextOpen, _event, reason) => {
      setOpenedByHover(nextOpen && reason === 'hover');
      onOpenChange(nextOpen);
    },
    placement,
    middleware: [offset(4), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  // mouseOnly: a tap's emulated mouse events must not open a preview that the
  // tap's click would then turn into a close.
  const hoverInteraction = useHover(context, { enabled: hover, mouseOnly: true, move: true, delay: { open: 150, close: 150 } });
  const clickInteraction = useClick(context);
  const dismissInteraction = useDismiss(context);
  const roleInteraction = useRole(context, { role: 'dialog' });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    hoverInteraction,
    clickInteraction,
    dismissInteraction,
    roleInteraction,
  ]);

  // Marks a trigger whose popover a press or key opened (not a hover preview),
  // so the sliding top bar can stay on screen while it is open (globals.css).
  const pinned = open && !openedByHover;
  const referenceProps = getReferenceProps();

  return (
    <>
      {renderTrigger(setReference, pinned ? { ...referenceProps, 'data-popover-pinned': '' } : referenceProps)}
      {open && (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false} initialFocus={openedByHover ? -1 : 0}>
            <div
              ref={setFloating}
              style={floatingStyles}
              {...getFloatingProps()}
              aria-label={label}
              className={`z-50 ${className}`}
            >
              {children}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  );
}
