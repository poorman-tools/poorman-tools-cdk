import {
  APIFailedResponse,
  APISuccessResponse,
  withErrorHandler,
  withSessionHandler,
} from "../middleware";
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
    return new APIFailedResponse("Type is required", 400);
  }

  if (type === "email") {
    const email = req.body?.email;
    const password = req.body?.password;

    if (!email || !password) {
      return new APIFailedResponse("Email and password are required", 400);
    }

    // Do the email login here
    const validated = await validateEmailAuth(email, password);

    if (!validated) {
      return new APIFailedResponse("Email or password does not exist", 400);
    }

    res.status(200).json({
      token: await createSession(validated, {
        userAgent: req.headers["user-agent"],
        ip: req.ip ?? (req.headers["CloudFront-Viewer-Address"] as string),
        country: req.headers["CloudFront-Viewer-Country-Name"] as string,
      }),
    });

    return new APISuccessResponse({
      token: await createSession(validated, {
        userAgent: req.headers["user-agent"],
        ip: req.ip ?? (req.headers["CloudFront-Viewer-Address"] as string),
        country: req.headers["CloudFront-Viewer-Country-Name"] as string,
      }),
    });
  } else if (type === "github") {
    const userId = await validateGithubAuth(req.body?.code);

    if (!userId) {
      return new APIFailedResponse("Invalid Github code", 400);
    }

    return new APISuccessResponse({
      token: await createSession(userId, {
        userAgent: req.headers["user-agent"],
        ip: req.ip ?? (req.headers["CloudFront-Viewer-Address"] as string),
        country: req.headers["CloudFront-Viewer-Country-Name"] as string,
      }),
    });
  }

  return new APIFailedResponse("Invalid login type", 400);
});

export const handleMe = withSessionHandler(async ({ res, user }) => {
  // Get the list of workspace
  const workspaces = await getWorkspaceByUser(user.Id);

  return new APISuccessResponse({
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
    return new APISuccessResponse({ success: true });
  } else if (body?.SessionSuffix) {
    // Revoke the session based on its suffix
    await revokeSuffixSession(user.Id, body.SessionSuffix);
    return new APISuccessResponse({ success: true });
  }

  return new APIFailedResponse(
    "Please specified SessionID or SessionSuffix",
    400
  );
});

export const handleSessionList = withSessionHandler(async ({ res, user }) => {
  // Get the list of session
  const sessions = await getAllSessions(user.Id);

  return new APISuccessResponse(
    sessions.map((session) => {
      return {
        SessionSuffix: session.SessionId.substring(
          session.SessionId.length - 9
        ),
        CreatedAt: session.CreatedAt,
        LastUsedTimestamp: session.LastUsedTimestamp,
        UserAgent: session.UserAgent,
      };
    })
  );
});
