import { getDb } from "./neon";

type ProjectRole = "owner" | "admin" | "member" | "viewer";

const ROLE_HIERARCHY: Record<ProjectRole, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
};

/**
 * Check if a user can access a project, considering both ownership and team membership.
 * Returns the user's role if they have access, null otherwise.
 */
export async function getProjectRole(
  userId: string,
  projectId: string
): Promise<ProjectRole | null> {
  const db = getDb();

  // Check direct ownership first (most common case)
  const ownerRows = await db`
    SELECT id FROM projects WHERE id = ${projectId} AND user_id = ${userId}
  `;
  if (ownerRows.length > 0) return "owner";

  // Check team membership
  const memberRows = await db`
    SELECT role FROM project_members
    WHERE project_id = ${projectId} AND user_id = ${userId} AND accepted_at IS NOT NULL
  `;
  if (memberRows.length > 0) return memberRows[0].role as ProjectRole;

  return null;
}

/**
 * Check if a user has at least the required role level for a project.
 */
export async function canAccessProject(
  userId: string,
  projectId: string,
  requiredRole: ProjectRole = "viewer"
): Promise<boolean> {
  const role = await getProjectRole(userId, projectId);
  if (!role) return false;
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[requiredRole];
}

/**
 * Generate a secure invitation token.
 */
export function generateInviteToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 48; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * Create a project invitation.
 */
export async function createProjectInvitation(
  projectId: string,
  email: string,
  role: ProjectRole,
  invitedBy: string
): Promise<{ token: string; id: string }> {
  const db = getDb();
  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

  const rows = await db`
    INSERT INTO project_invitations (project_id, email, role, token, expires_at)
    VALUES (${projectId}, ${email}, ${role}, ${token}, ${expiresAt})
    RETURNING id
  `;

  // Also create a pending member record
  const existingUser = await db`SELECT id FROM users WHERE email = ${email.toLowerCase()} LIMIT 1`;
  if (existingUser.length > 0) {
    await db`
      INSERT INTO project_members (project_id, user_id, role, invited_by)
      VALUES (${projectId}, ${existingUser[0].id}, ${role}, ${invitedBy})
      ON CONFLICT (project_id, user_id) DO NOTHING
    `;
  }

  return { token, id: rows[0].id as string };
}

/**
 * Accept an invitation by token.
 */
export async function acceptInvitation(
  token: string,
  userId: string
): Promise<{ projectId: string } | null> {
  const db = getDb();

  const invitations = await db`
    SELECT id, project_id, role, email, expires_at, accepted_at
    FROM project_invitations
    WHERE token = ${token}
  `;

  if (invitations.length === 0) return null;
  const invitation = invitations[0];

  if (invitation.accepted_at) return null; // Already accepted
  if (new Date(invitation.expires_at as string) < new Date()) return null; // Expired

  const projectId = invitation.project_id as string;
  const role = invitation.role as string;

  // Mark invitation as accepted
  await db`UPDATE project_invitations SET accepted_at = NOW() WHERE id = ${invitation.id}`;

  // Create or update member record
  await db`
    INSERT INTO project_members (project_id, user_id, role, accepted_at)
    VALUES (${projectId}, ${userId}, ${role}, NOW())
    ON CONFLICT (project_id, user_id)
    DO UPDATE SET role = ${role}, accepted_at = NOW()
  `;

  return { projectId };
}
