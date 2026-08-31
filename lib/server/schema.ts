import { index, pgTable, text } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  createdAt: text("created_at").notNull(),
});

export const carts = pgTable("carts", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  quantitiesJson: text("quantities_json").notNull().default("{}"),
  updatedAt: text("updated_at").notNull(),
});

export const orderProposals = pgTable("order_proposals", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  proposalJson: text("proposal_json").notNull(),
  status: text("status").notNull(),
  approvalToken: text("approval_token"),
  createdAt: text("created_at").notNull(),
});

export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    proposalId: text("proposal_id").notNull().unique(),
    orderJson: text("order_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("orders_user_created_idx").on(table.userId, table.createdAt)],
);
