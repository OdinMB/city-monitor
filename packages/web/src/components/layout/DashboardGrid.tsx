import { type ReactNode, Children, cloneElement, isValidElement } from 'react';

export function DashboardGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 p-4">
      {Children.map(children, (child, index) => {
        if (isValidElement<{ revealIndex?: number }>(child)) {
          return cloneElement(child, { revealIndex: index });
        }
        return child;
      })}
    </div>
  );
}
