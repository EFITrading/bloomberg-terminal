/// <reference types="react" />
/// <reference types="react-dom" />

// Ensure JSX namespace is available
declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}

export {};