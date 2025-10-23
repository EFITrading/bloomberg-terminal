import { NextRequest, NextResponse } from 'next/server';
import { getCircuitBreakerStatus } from '@/lib/circuitBreaker';

// API endpoint to monitor circuit breaker status
export async function GET(request: NextRequest) {
 try {
 const status = getCircuitBreakerStatus();
 
 // Calculate overall system health
 const totalBreakers = status.length;
 const openBreakers = status.filter(b => b.state === 'OPEN').length;
 const halfOpenBreakers = status.filter(b => b.state === 'HALF_OPEN').length;
 
 let systemHealth: 'healthy' | 'degraded' | 'critical';
 if (openBreakers === 0) {
 systemHealth = 'healthy';
 } else if (openBreakers <= totalBreakers / 2) {
 systemHealth = 'degraded';
 } else {
 systemHealth = 'critical';
 }

 return NextResponse.json({
 success: true,
 systemHealth,
 summary: {
 totalCircuitBreakers: totalBreakers,
 healthy: status.filter(b => b.state === 'CLOSED').length,
 degraded: halfOpenBreakers,
 failed: openBreakers
 },
 circuitBreakers: status,
 timestamp: new Date().toISOString()
 });
 
 } catch (error) {
 console.error('Circuit breaker status API error:', error);
 return NextResponse.json({
 success: false,
 error: 'Failed to retrieve circuit breaker status',
 timestamp: new Date().toISOString()
 }, { status: 500 });
 }
}

// Allow manual reset of circuit breakers (for admin use)
export async function POST(request: NextRequest) {
 try {
 const { circuitBreakerName, action } = await request.json();
 
 if (action === 'reset' && circuitBreakerName) {
 const { circuitBreakers } = await import('@/lib/circuitBreaker');
 
 if (circuitBreakers[circuitBreakerName as keyof typeof circuitBreakers]) {
 circuitBreakers[circuitBreakerName as keyof typeof circuitBreakers].reset();
 
 return NextResponse.json({
 success: true,
 message: `Circuit breaker '${circuitBreakerName}' has been reset`,
 timestamp: new Date().toISOString()
 });
 } else {
 return NextResponse.json({
 success: false,
 error: `Unknown circuit breaker: ${circuitBreakerName}`,
 availableBreakers: Object.keys(circuitBreakers)
 }, { status: 400 });
 }
 }
 
 return NextResponse.json({
 success: false,
 error: 'Invalid action or missing circuitBreakerName'
 }, { status: 400 });
 
 } catch (error) {
 console.error('Circuit breaker control API error:', error);
 return NextResponse.json({
 success: false,
 error: 'Failed to control circuit breaker',
 timestamp: new Date().toISOString()
 }, { status: 500 });
 }
}