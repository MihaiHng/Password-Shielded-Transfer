// src/styles/buttonStyles.ts
import React from 'react';

// Style for the main navigation/tab buttons in App.tsx
export const headerButtonStyle: React.CSSProperties = {
    width: '150px',
    height: '60px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.2rem',
    fontWeight: 'bold',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease-in-out, color 0.2s ease-in-out', // Smooth transitions
};

// Style for action buttons within forms (like in SendTransfer.tsx)
export const formButtonStyle: React.CSSProperties = {
    width: '200px', // Slightly wider for form actions
    height: '50px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.05rem',
    fontWeight: 'bold',
    borderRadius: '6px',
    border: 'none',
    cursor: 'pointer',
    marginTop: '20px', // Add some top margin by default
    transition: 'background-color 0.2s ease-in-out, opacity 0.2s ease-in-out', // Smooth transitions
};