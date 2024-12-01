import { Handler, Request, Response } from "express";
import { UserSession, validateSession } from "../services/session-service";
import { UserRecord } from "../services/user-service";

interface BasicHandlerProps<BodyType = unknown, ParamType = unknown> {
  req: Request;
  res: Response;
  body?: BodyType;
  params?: ParamType;
}

export class APISuccessResponse {
  constructor(public data: unknown) {
    this.data = data;
  }
}

export class APIFailedResponse {
  constructor(public error: string, public statusCode: number = 400) {
    this.error = error;
    this.statusCode = statusCode;
  }
}

export type APIResponse = APISuccessResponse | APIFailedResponse;

export function withErrorHandler<BodyType = unknown, ParamType = unknown>(
  handler: (
    props: BasicHandlerProps<BodyType, ParamType>
  ) => Promise<APIResponse>
): Handler {
  return async (req, res) => {
    try {
      const response = await handler({
        req,
        res,
        body: req.body,
        params: req.params as ParamType,
      });

      if (response instanceof APISuccessResponse) {
        res.json({ data: response.data });
      } else {
        res.status(response.statusCode).json({ error: response.error });
        console.error(response.error);
      }
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
  ) => Promise<APIResponse>
): Handler {
  return withErrorHandler(
    async (props: BasicHandlerProps<BodyType, ParamType>) => {
      const { req, res } = props;

      const authorization = req.headers["authorization"];
      if (!authorization) {
        return new APIFailedResponse("Unauthorized", 401);
      }

      const [bearer, bearerToken] = authorization.split(" ");
      if (bearer !== "Bearer") {
        return new APIFailedResponse("Unauthorized", 401);
      }

      // Check if session is valid
      const session = await validateSession(
        bearerToken,
        req.params?.workspaceId
      );

      if (!session?.user) {
        return new APIFailedResponse("Unauthorized", 401);
      }

      return await handler({
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
  ) => Promise<APIResponse>
) {
  return withSessionHandler<BodyType, ParamType>(
    async (props: BasicHandlerWithUserProps<BodyType, ParamType>) => {
      const { req, session } = props;

      const workspaceId = req.params?.workspaceId;

      if (!workspaceId) {
        return new APIFailedResponse("Bad request");
      }

      return await handler({
        ...props,
        workspaceId,
        workspaceRole: session.role,
      });
    }
  );
}
