import path from 'node:path';
import { fileResponse } from '@/server/files';
import { errorResponse } from '@/server/http';
export const runtime = 'nodejs';
export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await params;
    if (!['tick', 'pop', 'whoosh'].includes(name)) throw new Error('Recurso desconocido');
    return fileResponse(path.resolve('public/assets', name + '.wav'), req, 'audio/wav');
  } catch (e) {
    return errorResponse(e);
  }
}
