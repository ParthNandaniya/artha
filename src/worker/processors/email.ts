import { getDb, emitPipelineEvent } from "../db";
import { getCompanyFrom, sendCompanyOutboundEmail } from "@/lib/postmark";

export async function processEmailJob(jobId: string, subType: "send", payload: Record<string, unknown>) {
  switch (subType) {
    case "send":
      return processSendEmail(jobId, payload);
  }
}

async function processSendEmail(jobId: string, payload: Record<string, unknown>) {
  const { projectId, to, subject, html, from } = payload as {
    projectId: string;
    to: string;
    subject: string;
    html: string;
    from?: string;
  };

  const db = getDb();
  const projects = await db`SELECT slug, name, company_email FROM projects WHERE id = ${projectId}`;
  if (projects.length === 0) throw new Error("Project not found");
  const project = projects[0];

  const fromAddr = from || getCompanyFrom(project.slug as string, project.name as string);

  await sendCompanyOutboundEmail({
    slug: project.slug as string,
    companyName: project.name as string,
    toEmail: to,
    subject,
    bodyHtml: html,
    from: fromAddr,
    replyTo: fromAddr,
    tag: "outreach",
    wrapLayout: false,
  });

  await emitPipelineEvent(jobId, projectId, "send_email", "completed", `Email sent to ${to}`, "success");
}
