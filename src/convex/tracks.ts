import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOrganizer, requireEvent } from "./lib/common";
import { appendAudit } from "./lib/audit";
export const listByEvent = query({ args:{eventId:v.id("events")}, handler: async(ctx,args)=>ctx.db.query("tracks").withIndex("by_event",q=>q.eq("eventId",args.eventId)).collect() });
export const create = mutation({ args:{eventId:v.id("events"),name:v.string(),description:v.string(),prizeDescription:v.optional(v.string()),prizeAmount:v.optional(v.number())}, handler:async(ctx,args)=>{const actor=await requireOrganizer(ctx);await requireEvent(ctx,args.eventId);const id=await ctx.db.insert("tracks",{eventId:args.eventId,name:args.name,description:args.description,prizeDescription:args.prizeDescription??"",prizeAmount:args.prizeAmount??0});await appendAudit(ctx,{eventId:args.eventId,actorId:actor._id,action:"track.create",targetType:"track",targetId:String(id),afterState:JSON.stringify(args)});return id;} });
export const update = mutation({ args:{trackId:v.id("tracks"),name:v.optional(v.string()),description:v.optional(v.string()),prizeDescription:v.optional(v.string()),prizeAmount:v.optional(v.number())}, handler:async(ctx,args)=>{const actor=await requireOrganizer(ctx);const t=await ctx.db.get(args.trackId);if(!t)throw new Error("Track not found");await ctx.db.patch(args.trackId,{name:args.name??t.name,description:args.description??t.description,prizeDescription:args.prizeDescription??t.prizeDescription,prizeAmount:args.prizeAmount??t.prizeAmount});await appendAudit(ctx,{eventId:t.eventId,actorId:actor._id,action:"track.update",targetType:"track",targetId:String(args.trackId),beforeState:JSON.stringify(t),afterState:JSON.stringify(args)});return {ok:true};} });
export const remove = mutation({ args:{trackId:v.id("tracks")}, handler:async(ctx,args)=>{
  const actor=await requireOrganizer(ctx);
  const t=await ctx.db.get(args.trackId);
  if(!t)throw new Error("Track not found");
  // Refuse while anything still points at the track. Deleting it would silently
  // orphan teams and submissions (their `trackId` would dangle and every track
  // column would fall back to "Open"), so the organizer is asked to move them
  // first — the same "fail closed, explain" contract the rest of the console uses.
  const teams=await ctx.db.query("teams").withIndex("by_event",(q)=>q.eq("eventId",t.eventId)).collect();
  const usedByTeams=teams.filter((team)=>team.trackId===args.trackId).length;
  const subs=await ctx.db.query("submissions").withIndex("by_event",(q)=>q.eq("eventId",t.eventId)).collect();
  const usedBySubs=subs.filter((s)=>s.trackId===args.trackId).length;
  if(usedByTeams>0||usedBySubs>0){
    throw new Error(`Track is in use by ${usedByTeams} team(s) and ${usedBySubs} submission(s) — reassign them first`);
  }
  await ctx.db.delete(args.trackId);
  await appendAudit(ctx,{eventId:t.eventId,actorId:actor._id,action:"track.delete",targetType:"track",targetId:String(args.trackId),beforeState:JSON.stringify(t),afterState:"deleted"});
  return {ok:true};
} });
