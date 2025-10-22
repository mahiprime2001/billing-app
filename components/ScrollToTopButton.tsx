import React from 'react';
import { Button } from './ui/button';
import { ArrowUp } from 'lucide-react';

interface ScrollToTopButtonProps {
  onClick: () => void;
}

export function ScrollToTopButton({ onClick }: ScrollToTopButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className="flex items-center space-x-1"
    >
      <ArrowUp className="h-4 w-4" />
      <span>Scroll to Top</span>
    </Button>
  );
}
