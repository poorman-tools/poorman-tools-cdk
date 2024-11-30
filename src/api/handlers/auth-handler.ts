import { withErrorHandler, withSessionHandler } from "../middleware";
import {
  validateEmailAuth,
  validateGithubAuth,
} from "../../services/auth-service";
import {
  createSession,
  getAllSessions,
  revokeSession,
  revokeSuffixSession,
} from "../../services/session-service";
import { getWorkspaceByUser } from "../../services/workspace-service";

export const handleAuth = withErrorHandler(async ({ req, res }) => {
  const type = req.body?.type;

  if (!type) {
    res.status(400).json({ error: "Type is required" });
    return;
  }

  if (type === "email") {
    const email = req.body?.email;
    const password = req.body?.password;

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    // Do the email login here
    const validated = await validateEmailAuth(email, password);

    if (!validated) {
      res.status(400).json({ error: "Email or password does not exist" });
      return;
    }

    res.status(200).json({
      token: await createSession(validated, {
        userAgent: req.headers["user-agent"],
        ip: req.ip ?? (req.headers["CloudFront-Viewer-Address"] as string),
        country: req.headers["CloudFront-Viewer-Country-Name"] as string,
      }),
    });

    return;
  } else if (type === "github") {
    const userId = await validateGithubAuth(req.body?.code);

    if (!userId) {
      res.status(400).json({ error: "Invalid Github code" });
      return;
    }

    res.status(200).json({
      token: await createSession(userId, {
        userAgent: req.headers["user-agent"],
        ip: req.ip ?? (req.headers["CloudFront-Viewer-Address"] as string),
        country: req.headers["CloudFront-Viewer-Country-Name"] as string,
      }),
    });

    return;
  }

  res.status(400).json({ error: "Invalid login type" });
});

export const handleMe = withSessionHandler(async ({ res, user }) => {
  // Get the list of workspace
  const workspaces = await getWorkspaceByUser(user.Id);

  res.json({
    Id: user.Id,
    Name: user.Name,
    Picture: user.Picture,
    Workspaces: workspaces,
  });
});

export const handleRevokeSession = withSessionHandler<{
  SessionId?: string;
  SessionSuffix?: string;
}>(async ({ res, user, body }) => {
  if (body?.SessionId) {
    // Revoke the session
    await revokeSession(body.SessionId);
    res.status(200).json({});
    return;
  } else if (body?.SessionSuffix) {
    // Revoke the session based on its suffix
    await revokeSuffixSession(user.Id, body.SessionSuffix);
    res.status(200).json({});
    return;
  }

  res
    .status(400)
    .json({ error: "Please specified SessionID or SessionSuffix" });
});

export const handleSessionList = withSessionHandler(async ({ res, user }) => {
  // Get the list of session
  const sessions = await getAllSessions(user.Id);

  res.json({
    data: sessions.map((session) => {
      return {
        SessionSuffix: session.SessionId.substring(
          session.SessionId.length - 9
        ),
        CreatedAt: session.CreatedAt,
        LastUsedTimestamp: session.LastUsedTimestamp,
        UserAgent: session.UserAgent,
      };
    }),
  });
});
