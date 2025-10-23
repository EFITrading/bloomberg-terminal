/// <reference types="react" />
/// <reference types="react-dom" />

// Chart data interface
export interface ChartDataPoint {
 timestamp: number;
 open: number;
 high: number;
 low: number;
 close: number;
 volume: number;
 date: string;
 time: string;
}

// CSS module declarations
declare module '*.css' {
 const content: { [className: string]: string };
 export default content;
}

// CSS file declarations for side-effect imports
declare module '*.css' {
 const content: any;
 export = content;
}

// Ensure JSX namespace is available
declare global {
 namespace JSX {
 interface IntrinsicElements {
 [elemName: string]: any;
 }
 }
}

export {};