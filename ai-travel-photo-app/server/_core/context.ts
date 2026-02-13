import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { COOKIE_NAME } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import { jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import { ENV } from "./env";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    const ownerId = ENV.ownerOpenId || "local-super-admin";

    if (process.env.NODE_ENV === "development") {
      const cookieHeader = opts.req.headers.cookie;
      const parsed = cookieHeader ? parseCookieHeader(cookieHeader) : undefined;
      const token = parsed?.[COOKIE_NAME];
      if (token && ENV.cookieSecret) {
        const secretKey = new TextEncoder().encode(ENV.cookieSecret);
        const { payload } = await jwtVerify(token, secretKey, { algorithms: ["HS256"] });
        const openId = typeof payload.openId === "string" ? payload.openId : "";
        const name = typeof payload.name === "string" ? payload.name : "";

        if (openId) {
          user = {
            id: 0,
            openId,
            name,
            email: null,
            avatar: null,
            loginMethod: "dev",
            role: openId === ownerId ? "admin" : "user",
            points: 0,
            initialFreeCredits: 0,
            hasUsedFreeCredits: false,
            channelId: null,
            salesId: null,
            promotionCodeId: null,
            gender: null,
            userType: null,
            faceType: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            lastSignedIn: new Date(),
            lastSelfieUrl: null,
            lastSelfieTime: null,
          };
        }
      }

      // 渠道登录系统的超管 token（admin_superadmin_xxx）走 Authorization 头
      // 仅在开发环境开启，便于本地统一登录入口调试后台管理能力
      if (!user) {
        const authHeader = opts.req.headers.authorization;
        const bearerToken = typeof authHeader === "string" && authHeader.startsWith("Bearer ")
          ? authHeader.slice(7).trim()
          : "";

        if (bearerToken.startsWith("admin_superadmin_")) {
          user = {
            id: 0,
            openId: ownerId,
            name: "超级管理员",
            email: null,
            avatar: null,
            loginMethod: "dev",
            role: "admin",
            points: 0,
            initialFreeCredits: 0,
            hasUsedFreeCredits: false,
            channelId: null,
            salesId: null,
            promotionCodeId: null,
            gender: null,
            userType: null,
            faceType: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            lastSignedIn: new Date(),
            lastSelfieUrl: null,
            lastSelfieTime: null,
          };
        }
      }
    }

    if (user) {
      return {
        req: opts.req,
        res: opts.res,
        user,
      };
    }

    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
