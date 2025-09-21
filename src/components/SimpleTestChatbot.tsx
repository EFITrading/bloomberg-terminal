'use client';

import React from 'react';

export default function SimpleTestChatbot() {
  return (
    <div 
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: '300px',
        height: '400px',
        backgroundColor: '#000000',
        border: '2px solid #ff8800',
        borderRadius: '8px',
        color: 'white',
        padding: '20px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '16px',
        fontFamily: 'Arial, sans-serif'
      }}
    >
      <h3 style={{ margin: '0 0 20px 0', color: '#ff8800' }}>
        🤖 Test Chatbot
      </h3>
      <p style={{ textAlign: 'center', lineHeight: '1.5' }}>
        This is a simple test chatbot to verify the basic rendering functionality.
      </p>
      <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#333', borderRadius: '4px' }}>
        ✅ Chatbot is working!
      </div>
    </div>
  );
}