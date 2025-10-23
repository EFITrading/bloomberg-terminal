// API endpoint to control the data preloader service
import { NextRequest, NextResponse } from 'next/server';
import preloaderService from '@/lib/DataPreloaderService';

export async function GET(request: NextRequest) {
 try {
 const searchParams = request.nextUrl.searchParams;
 const action = searchParams.get('action');

 switch (action) {
 case 'start':
 preloaderService.start();
 return NextResponse.json({
 success: true,
 message: 'Data preloader started',
 stats: preloaderService.getStats()
 });

 case 'stop':
 preloaderService.stop();
 return NextResponse.json({
 success: true,
 message: 'Data preloader stopped'
 });

 case 'stats':
 return NextResponse.json({
 success: true,
 stats: preloaderService.getStats()
 });

 case 'force':
 const symbols = searchParams.get('symbols')?.split(',') || [];
 if (symbols.length > 0) {
 await preloaderService.forcePreload(symbols);
 return NextResponse.json({
 success: true,
 message: `Force preloaded ${symbols.length} symbols`,
 symbols
 });
 } else {
 return NextResponse.json({
 success: false,
 error: 'No symbols provided for force preload'
 }, { status: 400 });
 }

 default:
 return NextResponse.json({
 success: true,
 message: 'Data preloader service',
 stats: preloaderService.getStats(),
 actions: ['start', 'stop', 'stats', 'force']
 });
 }

 } catch (error) {
 console.error(' Preloader API error:', error);
 return NextResponse.json({
 success: false,
 error: 'Internal server error',
 details: error instanceof Error ? error.message : 'Unknown error'
 }, { status: 500 });
 }
}

export async function POST(request: NextRequest) {
 try {
 const body = await request.json();
 const { action, symbols, config } = body;

 switch (action) {
 case 'add-symbols':
 if (Array.isArray(symbols)) {
 symbols.forEach(symbol => preloaderService.addSymbol(symbol));
 return NextResponse.json({
 success: true,
 message: `Added ${symbols.length} symbols to preload list`
 });
 }
 break;

 case 'remove-symbols':
 if (Array.isArray(symbols)) {
 symbols.forEach(symbol => preloaderService.removeSymbol(symbol));
 return NextResponse.json({
 success: true,
 message: `Removed ${symbols.length} symbols from preload list`
 });
 }
 break;

 case 'update-config':
 if (config) {
 preloaderService.updateConfig(config);
 return NextResponse.json({
 success: true,
 message: 'Preloader configuration updated'
 });
 }
 break;

 default:
 return NextResponse.json({
 success: false,
 error: 'Invalid action'
 }, { status: 400 });
 }

 return NextResponse.json({
 success: false,
 error: 'Invalid request parameters'
 }, { status: 400 });

 } catch (error) {
 console.error(' Preloader API POST error:', error);
 return NextResponse.json({
 success: false,
 error: 'Internal server error',
 details: error instanceof Error ? error.message : 'Unknown error'
 }, { status: 500 });
 }
}