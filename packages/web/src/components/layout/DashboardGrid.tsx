import { type ReactNode, Children, cloneElement, isValidElement } from 'react';

export function DashboardGrid({ children }: { children: ReactNode }) {
  return (
    // Dense placement fills a hole a city's missing tile would leave with a
    // later tile that fits. A grid without holes (Berlin's) is placed as
    // without it.
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 grid-flow-row-dense gap-4 p-4">
      {Children.map(children, (child, index) => {
        if (isValidElement<{ revealIndex?: number }>(child)) {
          return cloneElement(child, { revealIndex: index });
        }
        return child;
      })}
    </div>
  );
}
