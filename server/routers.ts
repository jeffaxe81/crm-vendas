import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();
const clientPayload = z.object({
  type: z.enum(["person", "company"]),
  name: z.string().trim().min(2, "Informe um nome com ao menos 2 caracteres").max(200),
  document: optionalText(32),
  email: optionalText(320),
  phone: optionalText(40),
  city: optionalText(120),
});
const opportunityStages = z.enum(["prospecting", "qualification", "proposal", "negotiation", "won", "lost"]);
const pagination = z.object({ page: z.number().int().min(1).optional(), pageSize: z.number().int().min(1).max(100).optional() });

function adminOnly(role: string) {
  if (role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores." });
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  dashboard: router({
    get: protectedProcedure.query(({ ctx }) => db.getDashboard(ctx.user.id)),
  }),
  clients: router({
    list: protectedProcedure.input(pagination.extend({ search: z.string().max(200).optional(), status: z.enum(["active", "inactive", "all"]).optional(), type: z.enum(["person", "company"]).optional() })).query(({ input }) => db.listClients(input)),
    options: protectedProcedure.query(() => db.listActiveClientOptions()),
    create: protectedProcedure.input(clientPayload).mutation(({ ctx, input }) => db.createClient(input, ctx.user.id)),
    update: protectedProcedure.input(clientPayload.extend({ id: z.number().int().positive() })).mutation(({ ctx, input }) => db.updateClient(input, ctx.user.id)),
    inactivate: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ ctx, input }) => db.inactivateClient(input.id, ctx.user.id)),
    contacts: protectedProcedure.input(pagination.extend({ clientId: z.number().int().positive(), search: z.string().max(200).optional(), filter: z.enum(["all", "primary"]).optional() })).query(({ input }) => db.listContacts(input)),
    createContact: protectedProcedure.input(z.object({ clientId: z.number().int().positive(), name: z.string().trim().min(2).max(200), jobTitle: optionalText(120), email: optionalText(320), phone: optionalText(40), isPrimary: z.boolean().optional() })).mutation(({ ctx, input }) => db.createContact(input, ctx.user.id)),
    updateContact: protectedProcedure.input(z.object({ id: z.number().int().positive(), clientId: z.number().int().positive(), name: z.string().trim().min(2).max(200), jobTitle: optionalText(120), email: optionalText(320), phone: optionalText(40), isPrimary: z.boolean().optional() })).mutation(({ ctx, input }) => db.updateContact(input, ctx.user.id)),
    inactivateContact: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ ctx, input }) => db.inactivateContact(input.id, ctx.user.id)),
  }),
  opportunities: router({
    list: protectedProcedure.input(pagination.extend({ search: z.string().max(200).optional(), stage: opportunityStages.optional() })).query(({ input }) => db.listOpportunities(input)),
    create: protectedProcedure.input(z.object({ clientId: z.number().int().positive(), title: z.string().trim().min(2).max(200), estimatedValue: z.number().min(0), expectedCloseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(), stage: opportunityStages.optional() })).mutation(({ ctx, input }) => db.createOpportunity(input, ctx.user.id)),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), clientId: z.number().int().positive(), title: z.string().trim().min(2).max(200), estimatedValue: z.number().min(0), expectedCloseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(), stage: opportunityStages })).mutation(({ ctx, input }) => db.updateOpportunity(input, ctx.user.id)),
    move: protectedProcedure.input(z.object({ id: z.number().int().positive(), stage: opportunityStages, lossReason: optionalText(250) })).mutation(({ ctx, input }) => db.moveOpportunity(input, ctx.user.id)),
    inactivate: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ ctx, input }) => db.inactivateOpportunity(input.id, ctx.user.id)),
  }),
  activities: router({
    list: protectedProcedure.input(z.object({ status: z.enum(["pending", "completed", "cancelled"]).optional(), clientId: z.number().int().positive().optional(), opportunityId: z.number().int().positive().optional(), mine: z.boolean().optional() })).query(({ ctx, input }) => db.listActivities({ ...input, userId: input.mine ? ctx.user.id : undefined })),
    create: protectedProcedure.input(z.object({ type: z.enum(["task", "appointment"]), title: z.string().trim().min(2).max(200), description: optionalText(5000), clientId: z.number().int().positive().optional().nullable(), opportunityId: z.number().int().positive().optional().nullable(), priority: z.enum(["low", "medium", "high"]).optional(), dueAt: z.coerce.date().optional().nullable() })).mutation(({ ctx, input }) => db.createActivity(input, ctx.user.id)),
    updateStatus: protectedProcedure.input(z.object({ id: z.number().int().positive(), status: z.enum(["pending", "completed", "cancelled"]) })).mutation(({ ctx, input }) => db.updateActivityStatus(input.id, input.status, ctx.user.id)),
    inactivate: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ ctx, input }) => db.inactivateActivity(input.id, ctx.user.id)),
  }),
  interactions: router({
    list: protectedProcedure.input(z.object({ clientId: z.number().int().positive().optional(), opportunityId: z.number().int().positive().optional() })).query(({ input }) => db.listInteractions(input)),
    create: protectedProcedure.input(z.object({ type: z.enum(["call", "meeting", "email", "message", "note"]), description: z.string().trim().min(2).max(5000), clientId: z.number().int().positive().optional().nullable(), opportunityId: z.number().int().positive().optional().nullable(), occurredAt: z.coerce.date().optional() })).mutation(({ ctx, input }) => db.createInteraction(input, ctx.user.id)),
    inactivate: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ ctx, input }) => db.inactivateInteraction(input.id, ctx.user.id)),
  }),
  audit: router({
    list: protectedProcedure.query(({ ctx }) => {
      adminOnly(ctx.user.role);
      return db.listAuditLogs();
    }),
  }),
});

export type AppRouter = typeof appRouter;
