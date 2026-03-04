import { type ReactNode } from 'react';
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useClick,
  useHover,
  useDismiss,
  useInteractions,
  FloatingPortal,
  type Placement,
} from '@floating-ui/react';

interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Render the trigger element — attach ref and props for positioning */
  renderTrigger: (
    ref: (el: HTMLElement | null) => void,
    props: Record<string, unknown>,
  ) => ReactNode;
  children: ReactNode;
  placement?: Placement;
  /** Use hover instead of click to open */
  hover?: boolean;
  className?: string;
}

export function Popover({
  open,
  onOpenChange,
  renderTrigger,
  children,
  placement = 'bottom-start',
  hover = false,
  className = '',
}: PopoverProps) {
  const { refs: { setReference, setFloating }, floatingStyles, context } = useFloating({
    open,
    onOpenChange,
    placement,
    middleware: [offset(4), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const hoverInteraction = useHover(context, { enabled: hover, move: true, delay: { open: 150, close: 150 } });
  const clickInteraction = useClick(context, { enabled: !hover });
  const dismissInteraction = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([
    hoverInteraction,
    clickInteraction,
    dismissInteraction,
  ]);

  return (
    <>
      {renderTrigger(setReference, getReferenceProps())}
      {open && (
        <FloatingPortal>
          <div
            ref={setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className={`z-50 ${className}`}
          >
            {children}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
