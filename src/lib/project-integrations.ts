import type { Project } from "@/lib/types";

export type IntegrationSetupStatus = "pending" | "configured" | "skipped" | "failed";

type EmailSetupProject = {
  company_email?: Project["company_email"];
  email_setup_status?: Project["email_setup_status"] | null;
  email_setup_error?: Project["email_setup_error"];
};

type TweetSetupProject = {
  first_tweet_url?: Project["first_tweet_url"];
  tweet_setup_status?: Project["tweet_setup_status"] | null;
  tweet_setup_error?: Project["tweet_setup_error"];
};

export function getEmailSetupStatus(project: EmailSetupProject): IntegrationSetupStatus {
  if (project.email_setup_status === "configured" && !project.company_email) {
    return "pending";
  }

  return project.email_setup_status || (project.company_email ? "configured" : "pending");
}

export function getTweetSetupStatus(project: TweetSetupProject): IntegrationSetupStatus {
  return project.tweet_setup_status || (project.first_tweet_url ? "configured" : "pending");
}

export function canSendProjectEmail(project: EmailSetupProject): boolean {
  return getEmailSetupStatus(project) === "configured" && Boolean(project.company_email);
}

export function canPostProjectTweet(project: TweetSetupProject): boolean {
  const status = getTweetSetupStatus(project);
  return status === "configured" || status === "skipped";
}

export function getEmailSetupBlockedReason(project: EmailSetupProject): string | null {
  const status = getEmailSetupStatus(project);
  if (status === "configured") return null;

  if (status === "failed" && project.email_setup_error) {
    return `Email setup failed: ${project.email_setup_error}`;
  }

  if (status === "skipped" && project.email_setup_error) {
    return `Email setup is unavailable: ${project.email_setup_error}`;
  }

  return "Email setup is still pending. Create the company email in Settings before sending emails.";
}

export function getTweetSetupBlockedReason(project: TweetSetupProject): string | null {
  const status = getTweetSetupStatus(project);
  if (status === "configured" || status === "skipped") return null;

  if (status === "failed" && project.tweet_setup_error) {
    return `Twitter setup failed: ${project.tweet_setup_error}`;
  }

  return "Twitter setup is still pending. Finish the launch tweet setup in Settings before posting tweets.";
}
