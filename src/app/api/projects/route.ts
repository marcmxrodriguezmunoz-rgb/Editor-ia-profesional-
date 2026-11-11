import { createDemo, createProject } from '@/domain/project';
import { insertProject, listProjects } from '@/server/store';
import { errorResponse, jsonBody, mutationGuard } from '@/server/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  return Response.json(listProjects());
}
export async function POST(req: Request) {
  try {
    mutationGuard(req);
    const body = await jsonBody(req);
    return Response.json(insertProject(body.demo ? createDemo() : createProject()), {
      status: 201,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
