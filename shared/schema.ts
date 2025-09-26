import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  
  // Salesforce OAuth Configuration
  sf_client_id: text("sf_client_id"),
  sf_client_secret: text("sf_client_secret"),
  sf_instance_url: text("sf_instance_url"),
  
  // Salesforce OAuth Tokens
  sf_access_token: text("sf_access_token"),
  sf_refresh_token: text("sf_refresh_token"),
  sf_token_expires_at: timestamp("sf_token_expires_at"),
  
  // OAuth Status
  sf_oauth_configured: boolean("sf_oauth_configured").default(false),
  created_at: timestamp("created_at").default(sql`now()`),
  updated_at: timestamp("updated_at").default(sql`now()`),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertSalesforceConfigSchema = createInsertSchema(users).pick({
  sf_client_id: true,
  sf_client_secret: true,
  sf_instance_url: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertSalesforceConfig = z.infer<typeof insertSalesforceConfigSchema>;
export type User = typeof users.$inferSelect;
