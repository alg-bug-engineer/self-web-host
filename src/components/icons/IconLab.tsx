import React from 'react';

export default function IconLab({ className }: { className?: string }) {
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
      <path d="M10 2v7.31" />
      <path d="M14 9.31V2" />
      <path d="M17.65 11.65 22 7" />
      <path d="M6.35 11.65 2 7" />
      <path d="M12 22v-7.31" />
      <path d="M5.35 16.35 2 21" />
      <path d="M18.65 16.35 22 21" />
      <path d="M12 14.69a5 5 0 0 1-5-5V2h10v7.69a5 5 0 0 1-5 5Z" />
    </svg>
  );
}
