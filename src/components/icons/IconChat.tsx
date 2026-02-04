import React from 'react';

export default function IconChat({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20.94c-4.97-4.97-4.97-13.03 0-18.00" />
      <path d="M12 20.94c4.97-4.97 4.97-13.03 0-18.00" />
      <path d="M20 9.5c0 4.97-4.03 9-9 9" />
      <path d="M4 9.5c0 4.97 4.03 9 9 9" />
    </svg>
  );
}
