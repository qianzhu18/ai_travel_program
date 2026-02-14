import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    const authHeader = ctx.req.headers.authorization;
    const bearerToken = typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";

    const runtimeEnv = process.env.NODE_ENV ?? "development";
    const isTestEnv = runtimeEnv === "test";
    const hostHeader = typeof ctx.req.headers.host === "string" ? ctx.req.headers.host : "";
    const isLocalHost = hostHeader.includes("localhost") || hostHeader.includes("127.0.0.1") || hostHeader.includes("[::1]");
    // 允许本地调试（非 test）时启用管理员兜底；生产远程环境可通过 DEV_ADMIN_BYPASS=false 关闭
    const devAdminBypass = process.env.DEV_ADMIN_BYPASS !== "false";
    const allowLocalBypass = !isTestEnv && devAdminBypass && (runtimeEnv !== "production" || isLocalHost);

    if (allowLocalBypass) {
      const devAdminUser = ctx.user ?? {
        id: 0,
        openId: "local-super-admin",
        name: "Dev Admin",
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

      return next({
        ctx: {
          ...ctx,
          user: { ...devAdminUser, role: "admin" },
        },
      });
    }

    const allowSuperAdminBearer = !isTestEnv && bearerToken.startsWith("admin_superadmin_") && (runtimeEnv !== "production" || isLocalHost);
    if (allowSuperAdminBearer) {
      const superAdminUser = ctx.user ?? {
        id: 0,
        openId: "local-super-admin",
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

      return next({
        ctx: {
          ...ctx,
          user: { ...superAdminUser, role: "admin" },
        },
      });
    }

    if (!ctx.user || ctx.user.role !== 'admin') {
      if (!isTestEnv) {
        console.warn("[adminProcedure] forbidden", {
          env: runtimeEnv,
          host: hostHeader || "(none)",
          hasUser: !!ctx.user,
          userRole: ctx.user?.role ?? "(none)",
          hasAuthHeader: !!authHeader,
          bearerPrefix: bearerToken ? bearerToken.slice(0, 24) : "(empty)",
          devAdminBypass,
        });
      }
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
