import { NextResponse } from 'next/server';
import { requireStaff, errorResponse } from '@/lib/access';

export const dynamic = 'force-dynamic';

// Is a document reader configured? (Never reveals the key itself.)
export async function GET() {
  try {
    await requireStaff();
    const openrouter = !!process.env.OPENROUTER_API_KEY && !!(process.env.OPENROUTER_MODELS || '').trim();
    const anthropic = !!process.env.ANTHROPIC_API_KEY;
    return NextResponse.json({
      configured: openrouter || anthropic,
      reader: openrouter ? 'openrouter' : anthropic ? 'anthropic' : null,
      missing: openrouter || anthropic ? null : process.env.OPENROUTER_API_KEY ? 'OPENROUTER_MODELS' : 'OPENROUTER_API_KEY and OPENROUTER_MODELS',
    });
  } catch (err) {
    return errorResponse(err);
  }
}
