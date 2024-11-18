import { Handler, Request, Response } from "express";
import { UserSession, validateSession } from "../services/session-service";
import { UserRecord } from "../services/user-service";

interface BasicHandlerProps<BodyType = unknown, ParamType = unknown> {
  req: Request;
  res: Response;
  body?: BodyType;
  params?: ParamType;
}

export function withErrorHandler<BodyType = unknown, ParamType = unknown>(
  handler: (props: BasicHandlerProps<BodyType, ParamType>) => Promise<void>
): Handler {
  return async (req, res) => {
    try {
      await handler({
        req,
        res,
        body: req.body,
        params: req.params as ParamType,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  };
}

interface BasicHandlerWithUserProps<BodyType = unknown, ParamType = unknown>
  extends BasicHandlerProps<BodyType, ParamType> {
  user: UserRecord;
  session: UserSession;
}

export function withSessionHandler<BodyType = unknown, ParamType = unknown>(
  handler: (
    props: BasicHandlerWithUserProps<BodyType, ParamType>
  ) => Promise<void>
): Handler {
  return withErrorHandler(
    async (props: BasicHandlerProps<BodyType, ParamType>) => {
      const { req, res } = props;

      const authorization = req.headers["authorization"];
      if (!authorization) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const [bearer, bearerToken] = authorization.split(" ");
      if (bearer !== "Bearer") {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      // Check if session is valid
      const session = await validateSession(
        bearerToken,
        req.params?.workspaceId
      );

      if (!session?.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      await handler({
        ...props,
        user: session.user,
        session,
      });
    }
  );
}

interface BasicHandlerWithWorkspaceProps<
  BodyType = unknown,
  ParamType = unknown
> extends BasicHandlerWithUserProps<BodyType, ParamType> {
  workspaceId: string;
  workspaceRole: string;
}

export function withWorkspaceSession<BodyType = unknown, ParamType = unknown>(
  handler: (
    props: BasicHandlerWithWorkspaceProps<BodyType, ParamType>
  ) => Promise<any>
) {
  return withSessionHandler<BodyType, ParamType>(
    async (props: BasicHandlerWithUserProps<BodyType, ParamType>) => {
      const { req, res, session } = props;

      const workspaceId = req.params?.workspaceId;

      if (!workspaceId) {
        res.status(400).json({ error: "Bad request" });
        return;
      }

      await handler({
        ...props,
        workspaceId,
        workspaceRole: session.role,
      });
    }
  );
}
