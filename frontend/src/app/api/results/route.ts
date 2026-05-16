import { NextResponse } from 'next/server';

export async function GET() {
  const BACKEND_URL = "https://cybersoul18-truthlens-backend.hf.space/results";
  
  try {
    const response = await fetch(BACKEND_URL, {
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Proxy Error:", error);
    return NextResponse.json({ error: "Failed to fetch from backend" }, { status: 500 });
  }
}
