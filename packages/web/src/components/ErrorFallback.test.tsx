import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppErrorFallback, StripErrorFallback, MapErrorFallback } from './ErrorFallback.js';

describe('AppErrorFallback', () => {
  it('renders error message and reload button', () => {
    render(<AppErrorFallback error={new Error('test crash')} resetErrorBoundary={vi.fn()} />);
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByRole('button', { name: /reload/i })).toBeTruthy();
  });

  it('shows error details for Error instances', () => {
    render(<AppErrorFallback error={new Error('test crash')} resetErrorBoundary={vi.fn()} />);
    expect(screen.getByText('test crash')).toBeTruthy();
  });

  it('shows stringified details for non-Error values', () => {
    render(<AppErrorFallback error="string error" resetErrorBoundary={vi.fn()} />);
    expect(screen.getByText('string error')).toBeTruthy();
  });
});

describe('StripErrorFallback', () => {
  it('renders failed-to-load message with domain name', () => {
    render(<StripErrorFallback domain="Weather" onRetry={vi.fn()} />);
    expect(screen.getByText(/failed to load/i)).toBeTruthy();
  });

  it('calls onRetry when retry button is clicked', () => {
    const onRetry = vi.fn();
    render(<StripErrorFallback domain="Weather" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('makes Retry a 24px target without growing the row (WCAG 2.5.8)', () => {
    // jsdom does no layout, so check the classes: 24px minimum on both axes,
    // and -my-1 to take the 8px back out of the row's height.
    render(<StripErrorFallback domain="Weather" onRetry={vi.fn()} />);
    const retry = screen.getByRole('button', { name: /retry/i });
    for (const cls of ['min-h-6', 'min-w-6', '-my-1']) {
      expect(retry.classList.contains(cls)).toBe(true);
    }
  });
});

describe('MapErrorFallback', () => {
  it('renders map unavailable message', () => {
    render(<MapErrorFallback resetErrorBoundary={vi.fn()} />);
    expect(screen.getByText(/map unavailable/i)).toBeTruthy();
  });

  it('calls resetErrorBoundary on retry click', () => {
    const reset = vi.fn();
    render(<MapErrorFallback resetErrorBoundary={reset} />);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it('makes Retry a 24px target (WCAG 2.5.8)', () => {
    render(<MapErrorFallback resetErrorBoundary={vi.fn()} />);
    const retry = screen.getByRole('button', { name: /retry/i });
    expect(retry.classList.contains('min-h-6')).toBe(true);
    expect(retry.classList.contains('min-w-6')).toBe(true);
  });
});
