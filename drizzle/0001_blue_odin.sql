CREATE TABLE "budgets" (
	"user_id" text PRIMARY KEY NOT NULL,
	"limit_amount" text DEFAULT '0' NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;