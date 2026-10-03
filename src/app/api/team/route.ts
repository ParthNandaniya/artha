import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/neon";
import { getProjectRole, canAccessProject, createProjectInvitation } from "@/lib/project-auth";
import { InviteTeamMemberSchema, parseBody } from "@/lib/validation";

export async function GET(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });

  const role = await getProjectRole(user.id, projectId);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const db = getDb();

  // Get accepted members with user info
  const members = await db`
    SELECT
      pm.id,
      pm.user_id,
      pm.role,
      pm.accepted_at,
      u.name,
      u.email,
      u.avatar_url
    FROM project_members pm
    JOIN users u ON u.id = pm.user_id
    WHERE pm.project_id = ${projectId} AND pm.accepted_at IS NOT NULL
    ORDER BY pm.accepted_at ASC
  `;

  // Get project owner
  const ownerRows = await db`
    SELECT u.id AS user_id, u.name, u.email, u.avatar_url
    FROM projects p
    JOIN users u ON u.id = p.user_id
    WHERE p.id = ${projectId}
    LIMIT 1
  `;

  const owner = ownerRows.length > 0
    ? { id: "owner", user_id: ownerRows[0].user_id, role: "owner", name: ownerRows[0].name, email: ownerRows[0].email, avatar_url: ownerRows[0].avatar_url }
    : null;

  // Get pending invitations
  const invitations = await db`
    SELECT id, email, role, expires_at
    FROM project_invitations
    WHERE project_id = ${projectId} AND accepted_at IS NULL AND expires_at > NOW()
    ORDER BY expires_at ASC
  `;

  return NextResponse.json({
    members: [
      ...(owner ? [owner] : []),
      ...members.map((m) => ({
        id: m.id,
        user_id: m.user_id,
        role: m.role,
        name: m.name,
        email: m.email,
        avatar_url: m.avatar_url,
      })),
    ],
    invitations: invitations.map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      expires_at: inv.expires_at,
    })),
    currentUserRole: role,
  });
}

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await request.json();
  const parsed = parseBody(InviteTeamMemberSchema, raw);
  if (!parsed.success) return parsed.response;
  const { projectId, email, role } = parsed.data;

  const canInvite = await canAccessProject(user.id, projectId, "admin");
  if (!canInvite) {
    return NextResponse.json({ error: "Only owners and admins can invite members" }, { status: 403 });
  }

  try {
    const result = await createProjectInvitation(projectId, email, role, user.id);
    return NextResponse.json({ success: true, invitationId: result.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to create invitation" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const memberId = searchParams.get("memberId");
  const invitationId = searchParams.get("invitationId");

  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  if (!memberId && !invitationId) return NextResponse.json({ error: "Missing memberId or invitationId" }, { status: 400 });

  const canRemove = await canAccessProject(user.id, projectId, "admin");
  if (!canRemove) {
    return NextResponse.json({ error: "Only owners and admins can remove members" }, { status: 403 });
  }

  const db = getDb();

  if (invitationId) {
    await db`DELETE FROM project_invitations WHERE id = ${invitationId} AND project_id = ${projectId}`;
    return NextResponse.json({ success: true });
  }

  if (memberId) {
    // Prevent removing the project owner
    const ownerRows = await db`SELECT user_id FROM projects WHERE id = ${projectId}`;
    const memberRows = await db`SELECT user_id FROM project_members WHERE id = ${memberId} AND project_id = ${projectId}`;
    if (memberRows.length > 0 && ownerRows.length > 0 && memberRows[0].user_id === ownerRows[0].user_id) {
      return NextResponse.json({ error: "Cannot remove the project owner" }, { status: 400 });
    }

    await db`DELETE FROM project_members WHERE id = ${memberId} AND project_id = ${projectId}`;
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Nothing to delete" }, { status: 400 });
}
