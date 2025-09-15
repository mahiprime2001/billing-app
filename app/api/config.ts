import { NextResponse } from 'next/server';

// Check if we're in a static export
const isStaticExport = process.env.NEXT_PHASE === 'phase-export' || process.env.NEXT_OUTPUT_MODE === 'export';

// Helper function to handle responses for static exports
export function handleStaticResponse<T>(data: T, revalidate = 0) {
  if (isStaticExport) {
    // For static exports, we return the data directly
    return NextResponse.json(data);
  }
  
  // For dynamic requests, we can use revalidation
  const response = NextResponse.json(data);
  if (revalidate > 0) {
    response.headers.set('Cache-Control', `s-maxage=${revalidate}, stale-while-revalidate`);
  }
  return response;
}

// Helper function to handle errors
export function handleError(error: any, message = 'An error occurred') {
  console.error(message, error);
  return NextResponse.json(
    { error: message, details: error.message },
    { status: 500 }
  );
}
