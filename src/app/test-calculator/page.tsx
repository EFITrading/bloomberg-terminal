'use client';

import OptionsCalculator from '@/components/calculator/OptionsCalculator';

export default function TestCalculator() {
  return (
    <div className="min-h-screen bg-black text-white p-8">
      <h1 className="text-2xl font-bold mb-4">Options Calculator Test</h1>
      <OptionsCalculator />
    </div>
  );
}