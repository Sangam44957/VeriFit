import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Home from '@/app/page';

describe('Home Page', () => {
  it('renders the VeriFit title', () => {
    render(<Home />);
    expect(screen.getByText('VeriFit')).toBeInTheDocument();
  });

  it('contains the project description', () => {
    render(<Home />);
    expect(screen.getByText(/Candidate Evidence Intelligence/i)).toBeInTheDocument();
  });

  it('has a health check link', () => {
    render(<Home />);
    const link = screen.getByRole('link', { name: /health check/i });
    expect(link).toHaveAttribute('href', '/health');
  });
});
