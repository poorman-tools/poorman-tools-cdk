import { withErrorHandler, withSessionHandler } from "../middleware";
import { validateEmailAuth } from "../../services/auth-service";
import { createSession } from "../../services/session-service";
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
